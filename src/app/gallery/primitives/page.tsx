import { Folder, Users } from "lucide-react";
import { AnswerCount } from "@/components/ui/AnswerCount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { Icon } from "@/components/ui/Icon";
import { JoinCode } from "@/components/ui/JoinCode";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ResultsChart } from "@/components/ui/ResultsChart";
import { TextLink } from "@/components/ui/TextLink";
import { PrimitivesDemo } from "./demo";
import { DialogDemo } from "./dialog-demo";
import { FoundationDemo } from "./foundation-demo";
import {
  ButtonLadder,
  ContentsStates,
  EmptyStates,
  ErrorStates,
  FieldStates,
  LoadingStates,
  NoticeStates,
  PageHeaderStates,
  TextareaStates,
} from "./states-demo";

const CHART = [
  {
    letter: "A",
    label: "Auscultate the lungs and check oxygen saturation",
    count: 13,
    isKey: true,
  },
  { letter: "B", label: "Encourage the client to drink more fluids", count: 1 },
  { letter: "C", label: "Document the weight and reassess tomorrow", count: 3 },
  { letter: "D", label: "Teach the client about low-sodium food choices", count: 5 },
];

export default function PrimitivesPage() {
  return (
    <article className="max-w-4xl">
      <p className="eyebrow">Foundations</p>
      <h1 className="mt-2 text-2xl font-semibold">Primitives</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The few building blocks everything else composes. Each has a visible focus state and a 44px
        minimum tap target.
      </p>

      <ButtonLadder />
      <FieldStates />
      <TextareaStates />
      <NoticeStates />
      <PageHeaderStates />
      <EmptyStates />
      <LoadingStates />
      <ErrorStates />
      <ContentsStates />

      <section id="gallery-appshell" className="mt-12">
        <h2 className="text-lg font-semibold">AppShell</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          The frame of every signed-in page, for a teacher and a student, with the account menu open
          and closed, on a phone and a desktop, with and without the billing notice.
        </p>
        <p className="mt-3">
          <TextLink href="/gallery/app-shell">See the app shell states</TextLink>
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">TextLink, Icon and Badge</h2>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <TextLink href="/gallery/primitives">Back to the library</TextLink>
          <p>
            Read{" "}
            <TextLink href="/gallery/primitives" kind="inline">
              the question guide
            </TextLink>{" "}
            first.
          </p>
          <Icon icon={Folder} label="Folder" />
          <Icon icon={Users} size="stage" label="People" />
          <Badge live>Live</Badge>
          <Badge>Draft</Badge>
          <Badge tone="accent">New</Badge>
        </div>
      </section>

      <PrimitivesDemo />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Card</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm font-medium">Raised</p>
            <p className="mt-1 text-sm text-ink-2">Cards, the EHR panel, item containers.</p>
          </Card>
          <Card tone="inset">
            <p className="text-sm font-medium">Inset</p>
            <p className="mt-1 text-sm text-ink-2">Grouped or secondary content, table stripes.</p>
          </Card>
        </div>
      </section>

      <section className="mt-10 grid max-w-xl gap-4">
        <h2 className="text-lg font-semibold">Live status</h2>
        <AnswerCount answered={18} total={24} />
        <ProgressBar value={18} max={24} label="Answered" valueText="18 of 24 answered" />
        <div className="flex flex-wrap gap-6">
          <ConnectionStatus status="connected" />
          <ConnectionStatus status="reconnecting" />
          <ConnectionStatus status="offline" />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">JoinCode</h2>
        <JoinCode
          className="mt-3"
          code="V96RN8"
          url="learn-nclex.app/join"
          qrUrl="https://learn-nclex.app/join/V96RN8"
        />
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold">ResultsChart</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-2">
          One neutral hue. The key gets the correct fill, a 3px outline and a check with the word.
        </p>
        <ResultsChart className="mt-4" rows={CHART} total={22} />
      </section>

      <FoundationDemo />

      <DialogDemo />
    </article>
  );
}
