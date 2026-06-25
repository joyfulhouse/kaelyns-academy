"use client";

import { useRef, useState, useTransition } from "react";
import { useForm, useFieldArray, useController } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import {
  FloppyDiskIcon,
  PlusIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Surface } from "@/components/ui/Surface";
import { saveVersionTreeAction } from "@/app/(admin)/admin/actions";
import {
  editableToForm,
  formToEditable,
  newUnit,
  validateConfigJson,
} from "@/lib/admin/editor-model";
import type { EditorFormValues } from "@/lib/admin/editor-model";
import { UnitFields } from "./UnitFields";
import type { EditableVersion } from "@/lib/content/store";

// ── Zod resolver schema (structural + required fields only) ──────────────────
// Config validation is handled per-activity by ConfigEditor + onValidChange.
// This schema just enforces required keys/titles/kinds so we can surface errors.

const activitySchema = z.object({
  activityKey: z.string().min(1, "Activity key is required"),
  kind: z.string().min(1, "Kind is required"),
  title: z.string().min(1, "Activity title is required"),
  blurb: z.string(),
  estMinutes: z.string(),
  band: z.string().min(1),
  skillTags: z.array(z.string()),
  standardTags: z.array(z.string()),
  configJson: z.string().min(1, "Config is required"),
});

const lessonSchema = z.object({
  lessonKey: z.string().min(1, "Lesson key is required"),
  title: z.string().min(1, "Lesson title is required"),
  activities: z.array(activitySchema),
});

const unitSchema = z.object({
  unitKey: z.string().min(1, "Unit key is required"),
  title: z.string().min(1, "Unit title is required"),
  emoji: z.string(),
  world: z.string().min(1),
  bigIdea: z.string(),
  phonicsFocus: z.string(),
  mathFocus: z.string(),
  project: z.string(),
  checkpoint: z.string(),
  lessons: z.array(lessonSchema),
});

const metadataSchema = z.object({
  title: z.string().min(1, "Program title is required"),
  subtitle: z.string(),
  ageBand: z.string(),
  summary: z.string(),
  world: z.string(),
  locale: z.string(),
  languages: z.string(),
});

const editorFormSchema = z.object({
  metadata: metadataSchema,
  units: z.array(unitSchema),
});

// ── Component ─────────────────────────────────────────────────────────────────

interface ProgramEditorProps {
  version: EditableVersion;
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * PURE. Walk the form tree and return the first activity whose `configJson`
 * fails its per-kind schema, as a ready-to-show error message — or `null` when
 * every config is valid. This is the config save-gate: it reads live form state
 * (reorder-safe, unlike the positional invalidConfigsRef) and its message is what
 * the editor surfaces when a save is blocked, so it's unit-tested in isolation.
 */
export function firstConfigError(units: EditorFormValues["units"]): string | null {
  for (const unit of units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        const result = validateConfigJson(activity.kind, activity.configJson);
        if (!result.ok) {
          return `Activity "${activity.title || activity.activityKey}": ${result.message}`;
        }
      }
    }
  }
  return null;
}

/**
 * Root RHF form for the nested curriculum tree editor.
 * One `useForm` over `{ metadata, units }`. Save → `saveVersionTreeAction`.
 * Config validity is enforced by the explicit per-activity validateConfigJson
 * loop in onSubmit — that loop reads live form state and is reorder-safe.
 */
export function ProgramEditor({ version }: ProgramEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  // Advisory-only ref: tracks which configs have reported errors via
  // onValidChange, used only to surface a live "some configs have errors" hint.
  // TODO(5.3b): replace with per-kind form renderer that makes this redundant.
  // IMPORTANT: do NOT use this to short-circuit onSubmit — the positional
  // unit-${i} keys go stale after reorder. Gate Save on the explicit loop below.
  const invalidConfigsRef = useRef(new Set<string>());

  const { control, handleSubmit, formState: { errors } } = useForm<EditorFormValues>({
    resolver: zodResolver(editorFormSchema),
    defaultValues: editableToForm(version),
    mode: "onBlur",
  });

  const { fields: unitFields, append, remove, move } = useFieldArray({
    control,
    name: "units",
  });

  const { field: metaTitleField } = useController({ control, name: "metadata.title" });
  const { field: metaSubtitleField } = useController({ control, name: "metadata.subtitle" });
  const { field: metaAgeBandField } = useController({ control, name: "metadata.ageBand" });
  const { field: metaSummaryField } = useController({ control, name: "metadata.summary" });
  const { field: metaLocaleField } = useController({ control, name: "metadata.locale" });
  const { field: metaLanguagesField } = useController({ control, name: "metadata.languages" });

  const sensors = useSensors(useSensor(PointerSensor));

  function handleUnitDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = unitFields.findIndex((_, i) => `unit-${i}` === active.id);
    const newIndex = unitFields.findIndex((_, i) => `unit-${i}` === over.id);
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  }

  function handleConfigValidChange(fieldPath: string, valid: boolean) {
    if (valid) {
      invalidConfigsRef.current.delete(fieldPath);
    } else {
      invalidConfigsRef.current.add(fieldPath);
    }
  }

  function onSubmit(data: EditorFormValues) {
    // Validate all configJson values from current form state. This is the only
    // config gate — it's reorder-safe because it reads the live field array, not
    // the positional invalidConfigsRef keys.
    const configError = firstConfigError(data.units);
    if (configError) {
      setSaveState({ status: "error", message: configError });
      return;
    }

    setSaveState({ status: "saving" });

    startTransition(async () => {
      try {
        const tree = formToEditable(data);
        const result = await saveVersionTreeAction(version.versionId, tree);
        if (result.ok) {
          setSaveState({ status: "saved" });
          router.refresh();
        } else {
          setSaveState({ status: "error", message: result.message ?? "Save failed." });
        }
      } catch {
        setSaveState({ status: "error", message: "Save failed. Please try again." });
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-8"
    >
      {/* Version metadata */}
      <Surface tone="raised" className="border border-line p-6">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          Version metadata
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="metadata-title"
            label="Program title"
            error={errors.metadata?.title?.message}
            className="sm:col-span-2"
          >
            {(fp) => (
              <TextInput
                {...fp}
                value={metaTitleField.value as string}
                onChange={metaTitleField.onChange}
                onBlur={metaTitleField.onBlur}
                invalid={!!errors.metadata?.title}
                placeholder="Summer Bridge: K → 1st"
              />
            )}
          </Field>
          <Field id="metadata-subtitle" label="Subtitle" optional>
            {(fp) => (
              <TextInput
                {...fp}
                value={metaSubtitleField.value as string}
                onChange={metaSubtitleField.onChange}
                onBlur={metaSubtitleField.onBlur}
                placeholder="8-week summer program"
              />
            )}
          </Field>
          <Field id="metadata-ageBand" label="Age band" optional>
            {(fp) => (
              <TextInput
                {...fp}
                value={metaAgeBandField.value as string}
                onChange={metaAgeBandField.onChange}
                onBlur={metaAgeBandField.onBlur}
                placeholder="5-6"
              />
            )}
          </Field>
          <Field
            id="metadata-summary"
            label="Summary"
            optional
            className="sm:col-span-2"
          >
            {(fp) => (
              <TextInput
                {...fp}
                value={metaSummaryField.value as string}
                onChange={metaSummaryField.onChange}
                onBlur={metaSummaryField.onBlur}
                placeholder="A short description for the catalog"
              />
            )}
          </Field>
          <Field
            id="metadata-languages"
            label="Languages"
            hint="Comma-separated BCP-47 codes, e.g. en, zh-TW"
          >
            {(fp) => (
              <TextInput
                {...fp}
                value={metaLanguagesField.value as string}
                onChange={metaLanguagesField.onChange}
                onBlur={metaLanguagesField.onBlur}
                placeholder="en, zh-TW"
              />
            )}
          </Field>
          <Field id="metadata-locale" label="Default locale" optional>
            {(fp) => (
              <TextInput
                {...fp}
                value={metaLocaleField.value as string}
                onChange={metaLocaleField.onChange}
                onBlur={metaLocaleField.onBlur}
                placeholder="en"
              />
            )}
          </Field>
        </div>
      </Surface>

      {/* Units */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">
            Units ({unitFields.length})
          </h2>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleUnitDragEnd}
        >
          <SortableContext
            items={unitFields.map((_, i) => `unit-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            {unitFields.map((field, ui) => (
              <UnitFields
                key={field.id}
                unitIndex={ui}
                control={control}
                errors={errors}
                onRemove={() => { remove(ui); }}
                onConfigValidChange={(valid) => {
                  handleConfigValidChange(`unit-${ui}`, valid);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>

        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => { append(newUnit()); }}
          className="self-start"
        >
          <PlusIcon weight="bold" className="size-4" />
          Add unit
        </Button>
      </div>

      {/* Save bar */}
      <div className="flex items-center gap-4 rounded-xl border border-line bg-paper-raised p-4">
        <Button
          type="submit"
          variant="accent"
          size="md"
          disabled={isPending || saveState.status === "saving"}
        >
          <FloppyDiskIcon weight="regular" className="size-5" />
          {saveState.status === "saving" ? "Saving…" : "Save"}
        </Button>

        {saveState.status === "saved" && (
          <span
            role="status"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-success"
          >
            <CheckCircleIcon weight="fill" className="size-4" />
            Saved
          </span>
        )}
        {saveState.status === "error" && (
          <span
            role="alert"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"
          >
            <WarningCircleIcon weight="regular" className="size-4" />
            {saveState.message}
          </span>
        )}
      </div>
    </form>
  );
}
