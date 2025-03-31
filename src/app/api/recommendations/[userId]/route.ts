import { NextResponse } from "next/server";
import { dbConnect } from "../../../../lib/mongodb";
import Mentor2 from "../../../../models/Mentor2";
import Mentee from "../../../../models/Mentee";

// Cache database connection
let dbConnected = false;

const combineMentee = (mentee: any): string => {
  const { careerGoals, mentorshipGoals, challenges = "", technicalBackground, preferredMentorshipAreas } = mentee;
  return [
    careerGoals,
    mentorshipGoals,
    challenges,
    technicalBackground,
    preferredMentorshipAreas ? preferredMentorshipAreas.join(" ") : ""
  ].filter(Boolean).join(" ");
};

const combineMentor = (mentor: any): string => {
  const { mentoringGoals, technicalSkills, areasOfInterest, personalBio = "" } = mentor;
  return [
    mentoringGoals,
    technicalSkills ? technicalSkills.join(" ") : "",
    areasOfInterest ? areasOfInterest.join(" ") : "",
    personalBio
  ].filter(Boolean).join(" ");
};

const buildVocabulary = (texts: string[]): string[] => {
  const vocabSet = new Set<string>();
  texts.forEach(text => {
    text.split(/\W+/)
      .filter(Boolean)
      .forEach(token => vocabSet.add(token.toLowerCase()));
  });
  return Array.from(vocabSet);
};

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

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) || 0;
};

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    if (!dbConnected) {
      await dbConnect();
      dbConnected = true;
    }

    const { userId } = params;
    if (!userId) {
      return NextResponse.json(
        { error: "UserId not provided" },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const [mentee, mentors] = await Promise.all([
      Mentee.findOne({ userId }).lean(),
      Mentor2.find({}).lean()
    ]);

    if (!mentee) {
      return NextResponse.json(
        { error: "Mentee not found" },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!mentors?.length) {
      return NextResponse.json(
        { error: "No mentors available" },
        { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const menteeText = combineMentee(mentee);
    const mentorTexts = mentors.map(combineMentor);
    const vocab = buildVocabulary([menteeText, ...mentorTexts]);
    const menteeVector = vectorizeText(menteeText, vocab);

    const recommendations = mentors
      .map(mentor => ({
        mentor,
        similarity: cosineSimilarity(
          menteeVector,
          vectorizeText(combineMentor(mentor), vocab)
        )
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ similarity, mentor }) => ({
        similarity: Number(similarity.toFixed(4)),
        mentor: {
          userId: mentor.userId,
          fullName: mentor.fullName,
          email: mentor.email,
          profilePhoto: mentor.profilePhoto,
          currentRole: mentor.currentRole,
          company: mentor.company,
          mentoringGoals: mentor.mentoringGoals,
          technicalSkills: mentor.technicalSkills,
          areasOfInterest: mentor.areasOfInterest,
        }
      }));

    return NextResponse.json(
      { recommendations },
      {
        headers: {
          'Access-Control-Allow-Origin': 'https://mentorher-frontend.vercel.app',
          'CDN-Cache-Control': 'public, s-maxage=3600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=3600'
        }
      }
    );
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
}