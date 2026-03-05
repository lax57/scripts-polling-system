require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const QUEUE_URL = process.env.SQS_QUEUE_URL;
const FORWARD_URL = "https://utp-mobility.com/incoming";
const POLL_INTERVAL_MS = 5000;

if (!QUEUE_URL) {
  console.error("SQS_QUEUE_URL environment variable is required");
  process.exit(1);
}

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_KEY,
    secretAccessKey: "jMl44QWE8KhZqPg3cZ05p4ucrrlD2qDxUjvQTbDz",
  },
});

async function forwardMessage(body) {
  const res = await fetch(FORWARD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    throw new Error(`POST ${FORWARD_URL} returned ${res.status}: ${await res.text()}`);
  }

  return res.status;
}

async function poll() {
  const { Messages } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
  );

  if (!Messages || Messages.length === 0) return;

  console.log(`Received ${Messages.length} message(s)`);

  for (const msg of Messages) {
    try {
      const status = await forwardMessage(msg.Body);
      console.log(`Forwarded message ${msg.MessageId} -> ${status}`);

      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle,
        })
      );
    } catch (err) {
      console.error(`Failed to forward message ${msg.MessageId}:`, err.message);
    }
  }
}

async function main() {
  console.log(`Polling ${QUEUE_URL}`);
  console.log(`Forwarding to ${FORWARD_URL}`);

  while (true) {
    try {
      await poll();
    } catch (err) {
      console.error("Poll error:", err.message);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main();
