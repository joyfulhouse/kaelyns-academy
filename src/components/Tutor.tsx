'use client';

interface TutorProps {
  messages: Array<{ text: string }>;
  speaking: boolean;
  onTap?: () => void;
}

export default function Tutor({ messages, speaking, onTap }: TutorProps) {
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  if (!latestMessage) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex items-end gap-3 max-w-lg mx-auto">
      <button
        type="button"
        onClick={onTap}
        className="relative flex-shrink-0 w-14 h-14 rounded-full bg-paper border-2 border-cream-dark shadow-medium flex items-center justify-center text-3xl cursor-pointer transition-transform hover:scale-105 active:scale-95"
        aria-label="Ask for a hint"
      >
        <span role="img" aria-label="Owl tutor">
          {'\u{1F989}'}
        </span>
        {speaking && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-sage border-2 border-paper animate-pulse-scale" />
        )}
      </button>

      <div className="flex-1 bg-paper border-2 border-cream-dark rounded-2xl rounded-bl-sm px-4 py-3 shadow-soft animate-fade-slide-in">
        <p className="text-chocolate text-sm leading-relaxed">
          {latestMessage.text}
        </p>
      </div>
    </div>
  );
}
