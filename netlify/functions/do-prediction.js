const { PrismaClient, JobState } = require('@prisma/client');

const prisma = new PrismaClient();

exports.handler = async (event, context) => {
  const { model, temperature, isPublic, userId, question } =
    event.queryStringParameters;
  if (!userId) {
    return {
      statusCode: 400,
      body: '{}',
    };
  }
  const modelTemperature = parseInt(temperature);
  let job = null;

  if (!job) {
    job = await prisma.PredictionJob.create({
      data: {
        userId: userId,
        modelName: model,
        question: question,
        modelTemperature: modelTemperature,
        public: isPublic === 'true',
        resultProbability: 50,
        state: JobState.PENDING,
        createdAt: new Date()
      },
    });
  }
  return {
    statusCode: 302,
    headers: {
      Location: `/results/${job.id}`,
    },
  };
};
