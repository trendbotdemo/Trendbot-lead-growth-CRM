import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env, features } from "./env";
import type { Business, Review } from "@/db/schema";

let client: Anthropic | null = null;

function anthropic() {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** Fallback used when no Anthropic key is configured — still personal and on-policy. */
function templateReply(business: Business, review: Review) {
  const first = review.reviewerName?.split(" ")[0] ?? "there";
  if (review.rating >= 4) {
    return `Thank you so much, ${first}! We really appreciate you choosing ${business.name} and taking the time to share your experience. We look forward to helping you again.`;
  }
  if (review.rating === 3) {
    return `Thanks for the feedback, ${first}. We're glad parts of the job went well, and we'd love to hear how we could have made it better — please reach out to us directly${business.phone ? ` at ${business.phone}` : ""}.`;
  }
  return `${first}, we're sorry your experience didn't meet expectations. This isn't the standard we hold ourselves to at ${business.name}. Please contact us directly${business.phone ? ` at ${business.phone}` : ""} so we can make it right.`;
}

export async function draftReviewReply(business: Business, review: Review): Promise<string> {
  if (!features.ai) return templateReply(business, review);

  const system = [
    `You write public replies to Google reviews on behalf of a local business: ${business.name}${business.category ? ` (${business.category})` : ""}${business.city ? ` in ${business.city}${business.state ? `, ${business.state}` : ""}` : ""}.`,
    `Tone: ${business.replyTone}.`,
    "Rules: 2–4 sentences. Address the reviewer by first name if given. Reference something specific from the review when there is one.",
    "Never offer refunds, discounts or admit legal liability. For 1–3 stars, apologise, stay calm, and invite them to contact the business directly" +
      (business.phone ? ` at ${business.phone}` : "") +
      ".",
    "Naturally mention the service and city once when it fits (helps local search), but never stuff keywords.",
    "Output only the reply text — no quotes, no preamble.",
  ].join("\n");

  const user = `Reviewer: ${review.reviewerName ?? "Anonymous"}\nRating: ${review.rating}/5\nReview: ${review.comment?.trim() || "(rating only, no text)"}`;

  try {
    const res = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || templateReply(business, review);
  } catch (err) {
    console.error("AI reply draft failed, using template", err);
    return templateReply(business, review);
  }
}
