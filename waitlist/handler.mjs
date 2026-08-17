/**
 * Guestnote waitlist — public Lambda Function URL.
 *
 * POST { email, lang?, planner?, company? }  ->  { ok: true }
 *
 * Writes to DynamoDB and, for planner/venue leads only, publishes to SNS so
 * Joren gets an email. Signup notifications are deliberately NOT sent for every
 * address: SNS gives 1,000 free email notifications a month, and a spam run
 * would burn through that. Planner leads are low-volume and high-value, so they
 * are the ones worth interrupting for.
 *
 * The AWS SDK v3 clients are provided by the nodejs22.x managed runtime, so
 * there is nothing to bundle.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const ddb = new DynamoDBClient({});
const sns = new SNSClient({});

const TABLE = process.env.TABLE;
const TOPIC_ARN = process.env.TOPIC_ARN;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const MAX_BODY = 2048;
const MAX_EMAIL = 254;
// Deliberately conservative. This gates a marketing waitlist, not authentication --
// a false reject costs one lead, a false accept costs a junk row.
const EMAIL = /^[^\s@,;:<>()[\]\\"]+@[^\s@.,;:<>()[\]\\"]+(\.[^\s@.,;:<>()[\]\\"]+)+$/;

function cors(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0] || 'https://guestnote.be';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const reply = (status, body, origin) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(origin) },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  const origin = event?.headers?.origin || '';
  const method = event?.requestContext?.http?.method || 'POST';

  if (method === 'OPTIONS') return { statusCode: 204, headers: cors(origin) };
  if (method !== 'POST') return reply(405, { ok: false }, origin);

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';
  if (raw.length > MAX_BODY) return reply(413, { ok: false }, origin);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: 'bad_json' }, origin);
  }

  // Honeypot. Real visitors never see this field, so anything that fills it is a
  // bot -- answer 200 so it does not learn anything, and drop the write.
  if (typeof payload.company === 'string' && payload.company.trim() !== '') {
    return reply(200, { ok: true }, origin);
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL.test(email)) {
    return reply(400, { ok: false, error: 'bad_email' }, origin);
  }

  const lang = payload.lang === 'en' ? 'en' : 'nl';
  const planner = payload.planner === true;
  const now = new Date().toISOString();
  const ip = event?.requestContext?.http?.sourceIp || 'unknown';
  const ua = String(event?.headers?.['user-agent'] || '').slice(0, 256);

  // One row per address. `planner` only ever flips false -> true, so someone who
  // signs up and later ticks the planner box is upgraded rather than duplicated.
  const names = { '#c': 'createdAt', '#l': 'lang', '#s': 'lastSeen', '#i': 'ip', '#u': 'ua', '#h': 'hits' };
  const values = {
    ':now': { S: now },
    ':lang': { S: lang },
    ':ip': { S: ip },
    ':ua': { S: ua },
    ':one': { N: '1' },
  };
  let setExpr = '#c = if_not_exists(#c, :now), #l = :lang, #s = :now, #i = :ip, #u = :ua';
  if (planner) {
    names['#p'] = 'planner';
    values[':true'] = { BOOL: true };
    setExpr += ', #p = :true';
  }

  let existed = null;
  try {
    const res = await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { email: { S: email } },
        UpdateExpression: `SET ${setExpr} ADD #h :one`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_OLD',
      }),
    );
    existed = res.Attributes || null;
  } catch (err) {
    console.error('ddb_write_failed', { email, err: err?.name, msg: err?.message });
    return reply(500, { ok: false, error: 'write_failed' }, origin);
  }

  const isNew = existed === null;
  const newlyPlanner = planner && existed?.planner?.BOOL !== true;

  if (TOPIC_ARN && planner && (isNew || newlyPlanner)) {
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: TOPIC_ARN,
          Subject: 'Guestnote — planner lead',
          Message:
            `${email}\n\n` +
            `planner/venue: yes\n` +
            `language: ${lang}\n` +
            `first seen: ${isNew ? now : existed?.createdAt?.S || 'unknown'}\n` +
            `ip: ${ip}\n\n` +
            `This one wants a 15-minute call. Reply to them directly.`,
        }),
      );
    } catch (err) {
      // The signup is already stored; a failed notification must not fail the request.
      console.error('sns_publish_failed', { err: err?.name, msg: err?.message });
    }
  }

  console.log('signup', { email, lang, planner, isNew });
  return reply(200, { ok: true }, origin);
};
