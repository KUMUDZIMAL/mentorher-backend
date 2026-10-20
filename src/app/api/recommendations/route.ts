// app/api/recommendations/route.ts
import { NextResponse } from "next/server";
import { dbConnect } from "../../../lib/mongodb";
import Mentor2 from "../../../models/Mentor2";
import Mentee from "../../../models/Mentee";
import { cacheGet, cacheSet, getVersion } from "../../../lib/cache";

const RECOMMENDATIONS_TTL_SECONDS = 1800; // 30 minutes

// Combine key fields from a mentee into a single text string.
const combineMentee = (mentee: any): string => {
  const { careerGoals, mentorshipGoals, challenges = "", technicalBackground, preferredMentorshipAreas } = mentee;
  return [
    careerGoals,
    mentorshipGoals,
    challenges,
    technicalBackground,
    preferredMentorshipAreas ? preferredMentorshipAreas.join(" ") : ""
  ]
    .filter(Boolean)
    .join(" ");
};

// Combine key fields from a mentor into a single text string.
const combineMentor = (mentor: any): string => {
  const { mentoringGoals, technicalSkills, areasOfInterest, personalBio = "" } = mentor;
  return [
    mentoringGoals,
    technicalSkills ? technicalSkills.join(" ") : "",
    areasOfInterest ? areasOfInterest.join(" ") : "",
    personalBio
  ]
    .filter(Boolean)
    .join(" ");
};

// Build a vocabulary from an array of texts.
const buildVocabulary = (texts: string[]): string[] => {
  const vocabSet = new Set<string>();
  texts.forEach(text => {
    text.split(/\W+/)
      .filter(Boolean)
      .forEach(token => vocabSet.add(token.toLowerCase()));
  });
  return Array.from(vocabSet);
};

// Vectorize a text into a bag-of-words vector based on the provided vocabulary.
const vectorizeText = (text: string, vocab: string[]): number[] => {
  const vector = new Array(vocab.length).fill(0);
  text.split(/\W+/)
    .filter(Boolean)
    .map(token => token.toLowerCase())
    .forEach(token => {
      const index = vocab.indexOf(token);
      if (index !== -1) vector[index] += 1;
    });
  return vector;
};

// Compute cosine similarity between two vectors (plain JS - avoids loading
// the heavy TensorFlow.js runtime on every request).
const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    norm1 += a[i] * a[i];
    norm2 += b[i] * b[i];
  }
  return norm1 && norm2 ? dot / (Math.sqrt(norm1) * Math.sqrt(norm2)) : 0;
};

export async function GET(request: Request) {
  try {
    // Connect to the database.
    await dbConnect();

    // Extract userId from query parameters.
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { error: "UserId not provided in the query parameters." },
        { status: 400 }
      );
    }

    // Serve cached recommendations when available (invalidated whenever any
    // mentor profile changes via the mentors version bump).
    const ver = await getVersion("mentors");
    const cacheKey = `rec:${ver}:${userId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Retrieve the mentee profile using the provided userId.
    const mentee = await Mentee.findOne({ userId }).lean();
    if (!mentee) {
      return NextResponse.json({ error: "Mentee not found" }, { status: 404 });
    }

    // Retrieve all mentor profiles.
    const mentors = await Mentor2.find({}).lean();
    if (!mentors || mentors.length === 0) {
      // No mentors in the database yet - return an empty list so the UI can
      // render a proper empty state instead of an error.
      return NextResponse.json({ recommendations: [] });
    }

    // Combine text fields for mentee and mentors.
    const menteeText = combineMentee(mentee);
    const mentorTexts = mentors.map(mentor => combineMentor(mentor));

    // Build a vocabulary from both mentee and mentor texts.
    const vocab = buildVocabulary([menteeText, ...mentorTexts]);

    // Vectorize the mentee text.
    const menteeVector = vectorizeText(menteeText, vocab);

    // Compute cosine similarity between the mentee and each mentor.
    const mentorSimilarities = mentors.map((mentor, index) => {
      const mentorVector = vectorizeText(mentorTexts[index], vocab);
      const similarity = cosineSimilarity(menteeVector, mentorVector);
      return { mentor, similarity };
    });

    // Sort mentors by similarity (highest first) and select the top five.
    const recommendations = mentorSimilarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(rec => ({
        similarity: rec.similarity,
        mentor: {
          mentorId: String(rec.mentor._id),
          userId: String(rec.mentor.userId),
          fullName: rec.mentor.fullName,
          email: rec.mentor.email,
          profilePhoto: rec.mentor.profilePhoto,
          currentRole: rec.mentor.currentRole,
          company: rec.mentor.company,
          mentoringGoals: rec.mentor.mentoringGoals,
          technicalSkills: rec.mentor.technicalSkills,
          areasOfInterest: rec.mentor.areasOfInterest,
          availability: rec.mentor.availability ?? [],
        }
      }));

    const payload = { recommendations };
    await cacheSet(cacheKey, payload, RECOMMENDATIONS_TTL_SECONDS);

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error in GET /api/recommendations:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
