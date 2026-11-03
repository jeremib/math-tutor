import { Fragment } from "react";
import { splitFractions } from "@/lib/math-text";

/** Text with its fractions stacked, numerator over denominator, the way a textbook prints them. */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {splitFractions(text).map((part, i) => "text" in part ? <Fragment key={i}>{part.text}</Fragment> : (
        <span key={i} className="whitespace-nowrap">
          {part.whole}
          <span className="mx-[0.12em] inline-flex flex-col items-center align-middle text-[0.72em] leading-[1.15]" role="math" aria-label={`${part.whole ? `${part.whole} and ` : ""}${part.num} over ${part.den}`}>
            <span className="px-[0.15em]">{part.num}</span>
            <span className="self-stretch border-t-[0.09em] border-current px-[0.15em] text-center">{part.den}</span>
          </span>
        </span>
      ))}
    </>
  );
}
