'use client';

const BUTTON_COLORS = [
  { bg: 'bg-coral', hover: 'hover:bg-coral-dark', ring: 'ring-coral-dark' },
  { bg: 'bg-sage', hover: 'hover:bg-sage-dark', ring: 'ring-sage-dark' },
  { bg: 'bg-sky', hover: 'hover:bg-sky-dark', ring: 'ring-sky-dark' },
  { bg: 'bg-yellow', hover: 'hover:bg-yellow-dark', ring: 'ring-yellow-dark' },
] as const;

interface AnswerButtonsProps {
  options: (string | number)[];
  onAnswer: (answer: string | number) => void;
  disabled?: boolean;
  correctAnswer?: string | number;
  showResult?: boolean;
}

export default function AnswerButtons({
  options,
  onAnswer,
  disabled = false,
  correctAnswer,
  showResult = false,
}: AnswerButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md mx-auto px-4">
      {options.map((option, index) => {
        const color = BUTTON_COLORS[index % BUTTON_COLORS.length];
        const isCorrect = showResult && String(option) === String(correctAnswer);
        const isDimmed = showResult && !isCorrect;

        return (
          <button
            key={index}
            type="button"
            onClick={() => onAnswer(option)}
            disabled={disabled}
            className={`
              ${color.bg} ${color.hover}
              text-white font-display text-2xl font-bold
              py-5 px-4 rounded-xl
              min-h-[64px]
              transition-all duration-200
              active:scale-95
              disabled:cursor-not-allowed
              ${isCorrect ? `ring-4 ${color.ring} scale-105 animate-pop-in` : ''}
              ${isDimmed ? 'opacity-40' : ''}
              ${!disabled && !showResult ? 'hover:scale-105 hover:shadow-medium' : ''}
            `}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
