import { Prisma } from "@prisma/client";

/**
 * Generates sequential document numbers like PO-2026-00042 and retries on the rare
 * unique-constraint collision when two users save at the same moment.
 */
export async function withNextNumber<T>(
  prefix: string,
  findLatest: (startsWith: string) => Promise<{ number: string } | null>,
  create: (number: string) => Promise<T>,
): Promise<T> {
  const yearPrefix = `${prefix}-${new Date().getUTCFullYear()}-`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const latest = await findLatest(yearPrefix);
    const seq = latest ? Number(latest.number.slice(yearPrefix.length)) + 1 : 1;
    const number = `${yearPrefix}${String(seq + attempt).padStart(5, "0")}`;
    try {
      return await create(number);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error(`Could not allocate a ${prefix} number`);
}
