import { StartLiveButton } from "@/components/authoring/StartLiveButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Notice } from "@/components/ui/Notice";

export interface ClassLiveStartFormProps {
  className: string;
  /** The teacher's quizzes, or null when they could not be read. */
  quizzes: readonly { id: string; name: string; itemCount: number }[] | null;
  /** `startClassLiveSession`, bound to this class. */
  action: (form: FormData) => Promise<void>;
  /** Why the last start was refused, from the query string. */
  refusal?: string;
}

const questionCount = (n: number) => (n === 1 ? "1 question" : `${n} questions`);

/**
 * "Start a live session" for one class (ADR 0013): choose a quiz and the pacing, and the live
 * session starts for this class, exactly as the quiz page's start form does with "For a class"
 * set to it. Anyone can still join with the join code; students signed in to the class count
 * toward it.
 */
export function ClassLiveStartForm({
  className,
  quizzes,
  action,
  refusal,
}: ClassLiveStartFormProps) {
  if (quizzes === null) {
    return (
      <Notice role="alert">Your quizzes could not be loaded. Reload the page to try again.</Notice>
    );
  }
  if (quizzes.length === 0) {
    return (
      <EmptyState
        level={2}
        heading="No quizzes yet"
        body="Write a quiz first, then start it for this class."
        action={{ href: "/author", label: "Go to your quizzes" }}
      />
    );
  }
  return (
    <form action={action} className="flex max-w-reading flex-col items-start gap-6">
      {refusal ? <Notice role="alert">{refusal}</Notice> : null}
      <div className="flex w-full max-w-md flex-col gap-1">
        <label htmlFor="class-live-quiz" className="text-sm font-medium text-ink-1">
          Quiz
        </label>
        <select
          id="class-live-quiz"
          name="bankId"
          required
          defaultValue=""
          className={fieldClasses("max-w-full px-3 text-base")}
        >
          <option value="" disabled>
            Choose a quiz
          </option>
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {`${quiz.name} (${questionCount(quiz.itemCount)})`}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium text-ink-1">Pacing</legend>
        <div className="flex flex-wrap items-center gap-x-4">
          <label className="tap-target inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
            <input
              type="radio"
              name="pacing"
              value="instructor_paced"
              defaultChecked
              className="size-5 accent-accent"
            />
            Teacher-paced
          </label>
          <label className="tap-target inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
            <input
              type="radio"
              name="pacing"
              value="student_paced"
              className="size-5 accent-accent"
            />
            Student-paced
          </label>
        </div>
      </fieldset>
      <p className="max-w-prose text-ink-2">
        {`For ${className}. Students signed in to the class count toward it. Anyone else joins as a guest.`}
      </p>
      <StartLiveButton variant="primary" label="Start a live session" />
    </form>
  );
}
