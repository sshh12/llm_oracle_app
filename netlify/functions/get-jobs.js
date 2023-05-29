const { PrismaClient, JobState } = require('@prisma/client');

const prisma = new PrismaClient();

exports.handler = async (event, context) => {
  const jobs = await prisma.PredictionJob.findMany({
    where: { public: true, state: JobState.COMPLETE },
  });
  const jobsJSON = jobs.map(job => ({
    id: job.id,
    state: job.state,
    question: job.question,
    resultProbability: job.resultProbability,
    modelName: job.modelName,
    creditCost: job.creditCost,
  }));
  return {
    statusCode: 200,
    body: JSON.stringify(jobsJSON, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ),
  };
};
