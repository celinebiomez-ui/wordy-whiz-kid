/**
 * WordDiff: shows expected text with incorrect words highlighted in red,
 * correct words displayed normally.
 */

interface Props {
  expected: string;
  attempt: string;
}

export default function WordDiff({ expected, attempt }: Props) {
  const expectedWords = expected.trim().split(/\s+/);
  const attemptWords = attempt.trim().split(/\s+/);

  return (
    <p className="text-sm font-body leading-relaxed">
      {expectedWords.map((word, i) => {
        const attemptWord = attemptWords[i] || '';
        const isCorrect = word.toLowerCase() === attemptWord.toLowerCase();
        return (
          <span key={i}>
            {i > 0 && ' '}
            <span className={isCorrect ? 'text-foreground' : 'text-destructive font-bold underline'}>
              {word}
            </span>
          </span>
        );
      })}
    </p>
  );
}
