const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.findFirst();
    console.log('User found:', user ? { 
      id: user.id, 
      username: user.username, 
      hasPassword: !!user.passwordHash 
    } : 'No user');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
