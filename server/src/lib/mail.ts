import { env, isProd } from '../env.js';

export type MailPurpose = 'signup' | 'reset';

interface SendResult {
  delivered: boolean;
  devCode: string | null;
}

const SUBJECTS: Record<MailPurpose, string> = {
  signup: 'رمز تأكيد إنشاء الحساب — رجال الأمة',
  reset: 'رمز استعادة كلمة المرور — رجال الأمة',
};

const TITLES: Record<MailPurpose, string> = {
  signup: 'تأكيد إنشاء الحساب',
  reset: 'استعادة كلمة المرور',
};

const LEAD: Record<MailPurpose, string> = {
  signup: 'أهلاً بك في رجال الأمة. استخدم الرمز أدناه لتأكيد إنشاء حسابك:',
  reset: 'طلبنا استعادة كلمة مرورك. استخدم الرمز أدناه لإعادة تعيينها:',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c] as string);
}

function template(purpose: MailPurpose, code: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(SUBJECTS[purpose])}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f4ec;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f4ec;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e7e0cf;box-shadow:0 8px 24px rgba(31,41,55,0.08);">
            <!-- Header -->
            <tr>
              <td style="background-color:#123c3a;padding:28px 32px;text-align:center;">
                <span style="color:#f6d365;font-size:22px;font-weight:800;letter-spacing:0.5px;">رجال الأمة</span>
                <span style="display:block;color:#c9d6d4;font-size:12px;margin-top:6px;">مقرّرٌ يبني الإنسان… ومجتمعٌ يقرأ ويتفاعل</span>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#123c3a;text-align:center;">${escapeHtml(TITLES[purpose])}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.9;color:#57534e;text-align:center;">${escapeHtml(LEAD[purpose])}</p>

                <div style="background:#f6f1e3;border:2px dashed #d4b85c;border-radius:14px;padding:20px;text-align:center;">
                  <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#123c3a;direction:ltr;font-family:Consolas,Menlo,monospace;">${escapeHtml(code)}</div>
                </div>

                <p style="margin:20px 0 0;font-size:13px;line-height:1.9;color:#78716c;text-align:center;">
                  الرمز صالح لمدة ١٠ دقائق. إذا لم تكن طلبت هذا الرمز يمكنك تجاهل هذه الرسالة بأمان.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#faf7f0;padding:16px 32px;text-align:center;border-top:1px solid #eee7d5;">
                <span style="color:#a8a29e;font-size:12px;">© ${new Date().getFullYear()} رجال الأمة — جميع الحقوق محفوظة</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/**
 * Sends a verification code email. In development, MAIL_DEV_MODE (default '1')
 * skips the network and returns the code so the flow can be tested locally;
 * set MAIL_DEV_MODE=0 to deliver through Resend for a real delivery check.
 * Production always sends via Resend and requires a RESEND_API_KEY.
 */
export async function sendVerificationEmail(to: string, purpose: MailPurpose, code: string): Promise<SendResult> {
  const devMode = !isProd && env.MAIL_DEV_MODE !== '0';
  if (devMode) {
    console.log(`[mail:dev] ${purpose} code for ${to}: ${code}`);
    return { delivered: false, devCode: code };
  }
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  await sendViaResend(to, SUBJECTS[purpose], template(purpose, code));
  return { delivered: true, devCode: null };
}
