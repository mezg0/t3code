import { cn } from "../../lib/utils";
import type { Bot } from "./botStore";

const AVATAR_SIZE = 160;

export function BotAvatar(props: {
  bot: Pick<Bot, "name" | "avatar">;
  /** Size and text size, e.g. "size-5 text-3xs". */
  className?: string;
}) {
  if (props.bot.avatar !== null) {
    return (
      <img
        src={props.bot.avatar}
        alt=""
        aria-hidden
        className={cn("shrink-0 rounded-full object-cover", props.className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary/15 font-medium text-primary uppercase",
        props.className,
      )}
    >
      {Array.from(props.bot.name.trim())[0] ?? "?"}
    </span>
  );
}

/** A centred square crop, small enough to keep in localStorage. */
export async function avatarFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas is unavailable.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    bitmap.close();
  }
}
