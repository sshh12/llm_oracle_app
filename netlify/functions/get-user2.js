const { PrismaClient, JobState } = require('@prisma/client');

const prisma = new PrismaClient();

exports.handler = async (event, context) => {
  const { model, temp, public, userId, q } = event.queryStringParameters;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'UserId' }),
    };
  }
  const [user] = await Promise.all([
    prisma.User.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    }),
  ]);
  return {
    statusCode: 200,
    body: JSON.stringify({
      id: user.id,
      credits: user.credits,
      state: JobState.COMPLETE,
    }),
  };
};
