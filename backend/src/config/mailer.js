import nodemailer from 'nodemailer';

export function isMailConfigured() {
  const port = Number(process.env.SMTP_PORT);
  return Boolean(
    process.env.SMTP_HOST
    && Number.isInteger(port)
    && port > 0
    && port <= 65535
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
    && process.env.SMTP_FROM
    && process.env.CLIENT_ORIGIN
    && ['true', 'false'].includes(process.env.SMTP_SECURE || 'false')
  );
}

export async function sendPasswordResetEmail({ email, shopName, token }) {
  if (!isMailConfigured()) {
    const error = new Error('Password reset email is not configured');
    error.status = 503;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  const resetUrl = new URL('/reset-password', process.env.CLIENT_ORIGIN);
  resetUrl.searchParams.set('token', token);

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Reset your Bizora Pilot password',
    text: `Hello ${shopName},\n\nUse the link below to choose a new Bizora Pilot password. This link expires in one hour and can only be used once.\n\n${resetUrl.toString()}\n\nIf you did not request a password reset, you can ignore this email.`
  });
}
