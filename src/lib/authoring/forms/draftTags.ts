import { z } from "zod";
import { TAG_LIMITS } from "@/lib/ngn/tags";

/**
 * A draft's tags, within the same limits a published item has. The tag editor normalizes as it
 * goes, and the row is normalized again as it is stored, which can only make tags shorter or fewer.
 */
export const draftTagsSchema = z.array(z.string().max(TAG_LIMITS.length)).max(TAG_LIMITS.count);
