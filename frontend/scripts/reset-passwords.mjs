#!/usr/bin/env node
/**
 * Script: Reset passwords for specific users
 * Usage: node scripts/reset-passwords.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const PASSWORD_RESETS = [
  { email: 'prof01@uniabidjan.com', newPassword: 'Bonjour@2026' },
  { email: 'registrar@uniabidjan.com', newPassword: 'Bonjour#2026' },
];

async function main() {
  console.log('🔒 Password Reset Script\n');
  console.log('='.repeat(50));

  for (const { email, newPassword } of PASSWORD_RESETS) {
    console.log(`\n📧 Processing: ${email}`);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, actif: true, mustChangePwd: true },
    });

    if (!user) {
      console.log(`   ❌ User NOT FOUND: ${email}`);
      continue;
    }

    console.log(`   👤 Found: ${user.name} (${user.role})`);
    console.log(`   📊 Active: ${user.actif}, MustChangePwd: ${user.mustChangePwd}`);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log(`   🔑 New password hash generated`);

    // Update user
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePwd: false,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    console.log(`   ✅ Password updated successfully for: ${updated.email}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Password reset complete!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
