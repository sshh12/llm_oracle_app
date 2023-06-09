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
  let job = await prisma.PredictionJob.findFirst({
    where: {
      question: question,
      state: { in: [JobState.COMPLETE, JobState.PENDING] },
      modelTemperature: modelTemperature,
      modelName: model,
    },
  });
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
