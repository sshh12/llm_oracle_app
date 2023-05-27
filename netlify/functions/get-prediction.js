const { PrismaClient } = require('@prisma/client');

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
      state: { in: ['COMPLETE', 'PENDING'] },
      modelTemperature: modelTemperature,
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
        state: 'PENDING',
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
