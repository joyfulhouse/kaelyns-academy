"use client";

import { useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FieldErrors, Control } from "react-hook-form";
import { useController } from "react-hook-form";
import {
  DotsSixVerticalIcon,
  TrashIcon,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ActivityKind } from "@/content/activity-configs";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { defaultConfigFor } from "@/lib/admin/editor-model";
import { ConfigEditor } from "./ConfigEditor";
import { SkillTagCombobox } from "./SkillTagCombobox";
import { PronunciationHelper } from "./PronunciationHelper";
import type { EditorFormValues } from "@/lib/admin/editor-model";

const ACTIVITY_KINDS: ActivityKind[] = Object.keys(ACTIVITY_CONFIG_SCHEMAS) as ActivityKind[];

const KIND_OPTIONS = ACTIVITY_KINDS.map((k) => ({ value: k, label: k }));
const BAND_OPTIONS = [
  { value: "ready", label: "Ready" },
  { value: "stretch", label: "Stretch" },
];

interface ActivityFieldsProps {
  unitIndex: number;
  lessonIndex: number;
  activityIndex: number;
  control: Control<EditorFormValues>;
  errors: FieldErrors<EditorFormValues>;
  onRemove: () => void;
  onConfigValidChange: (valid: boolean) => void;
}

/** One activity row with drag handle + collapsible body. */
export function ActivityFields({
  unitIndex,
  lessonIndex,
  activityIndex,
  control,
  errors,
  onRemove,
  onConfigValidChange,
}: ActivityFieldsProps) {
  const prefix =
    `units.${unitIndex}.lessons.${lessonIndex}.activities.${activityIndex}` as const;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `act-${unitIndex}-${lessonIndex}-${activityIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [open, setOpen] = useState(false);

  const { field: titleField } = useController({ control, name: `${prefix}.title` });
  const { field: activityKeyField } = useController({ control, name: `${prefix}.activityKey` });
  const { field: kindField } = useController({ control, name: `${prefix}.kind` });
  const { field: bandField } = useController({ control, name: `${prefix}.band` });
  const { field: blurbField } = useController({ control, name: `${prefix}.blurb` });
  const { field: estMinutesField } = useController({ control, name: `${prefix}.estMinutes` });
  const { field: skillTagsField } = useController({ control, name: `${prefix}.skillTags` });
  const { field: standardTagsField } = useController({ control, name: `${prefix}.standardTags` });
  const { field: configField } = useController({ control, name: `${prefix}.configJson` });

  const actErrors =
    errors.units?.[unitIndex]?.lessons?.[lessonIndex]?.activities?.[activityIndex];

  function handleKindChange(newKind: string) {
    kindField.onChange(newKind);
    const skeleton = JSON.stringify(defaultConfigFor(newKind as ActivityKind), null, 2);
    configField.onChange(skeleton);
    onConfigValidChange(true);
  }

  const handleInsertPronunciation = useCallback(
    (token: string) => {
      blurbField.onChange((blurbField.value as string) + token);
    },
    [blurbField],
  );

  // standardTags stored as string[] but edited as comma-separated text
  const standardTagsDisplay = ((standardTagsField.value as string[]) ?? []).join(", ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-line bg-paper-raised"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Drag to reorder activity"
          className="cursor-grab touch-none text-ink-faint active:cursor-grabbing"
        >
          <DotsSixVerticalIcon weight="regular" className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => { setOpen((v) => !v); }}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-ink"
        >
          {open ? (
            <CaretDownIcon weight="regular" className="size-3.5 text-ink-faint" />
          ) : (
            <CaretRightIcon weight="regular" className="size-3.5 text-ink-faint" />
          )}
          <span className="truncate">
            {(titleField.value as string) || "(untitled activity)"}
          </span>
          <span className="shrink-0 rounded-pill border border-line px-1.5 py-0.5 text-xs text-ink-faint">
            {(kindField.value as string) || "—"}
          </span>
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove activity"
          className="rounded p-1 text-ink-faint transition-colors hover:text-danger"
        >
          <TrashIcon weight="regular" className="size-4" />
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field id={`${prefix}-title`} label="Title" error={actErrors?.title?.message}>
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  value={titleField.value as string}
                  onChange={titleField.onChange}
                  onBlur={titleField.onBlur}
                  invalid={!!actErrors?.title}
                  placeholder="Activity title"
                />
              )}
            </Field>
            <Field id={`${prefix}-activityKey`} label="Activity key">
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  value={activityKeyField.value as string}
                  onChange={activityKeyField.onChange}
                  onBlur={activityKeyField.onBlur}
                  placeholder="act-01"
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id={`${prefix}-kind`} label="Kind">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={kindField.value as string}
                  onChange={(e) => { handleKindChange(e.target.value); }}
                  options={KIND_OPTIONS}
                />
              )}
            </Field>
            <Field id={`${prefix}-band`} label="Band">
              {(fieldProps) => (
                <Select
                  {...fieldProps}
                  value={bandField.value as string}
                  onChange={(e) => { bandField.onChange(e.target.value); }}
                  options={BAND_OPTIONS}
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field
              id={`${prefix}-blurb`}
              label="Blurb"
              optional
              hint="Supports [label](/IPA/) overrides"
            >
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  value={blurbField.value as string}
                  onChange={blurbField.onChange}
                  onBlur={blurbField.onBlur}
                  placeholder="Short description for parents"
                />
              )}
            </Field>
            <Field id={`${prefix}-estMinutes`} label="Est. minutes" optional>
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  type="number"
                  min={1}
                  max={120}
                  value={estMinutesField.value as string}
                  onChange={estMinutesField.onChange}
                  onBlur={estMinutesField.onBlur}
                  placeholder="10"
                />
              )}
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink">Skill tags</p>
            <SkillTagCombobox
              value={(skillTagsField.value as string[]) ?? []}
              onChange={(tags) => { skillTagsField.onChange(tags); }}
            />
          </div>

          <Field
            id={`${prefix}-standardTags`}
            label="Standard tags"
            optional
            hint="Comma-separated, e.g. CCSS.RF.1.3"
          >
            {(fieldProps) => (
              <TextInput
                {...fieldProps}
                value={standardTagsDisplay}
                onChange={(e) => {
                  standardTagsField.onChange(
                    e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  );
                }}
                onBlur={standardTagsField.onBlur}
                placeholder="CCSS.RF.1.3, CCSS.RL.1.1"
              />
            )}
          </Field>

          <ConfigEditor
            kind={kindField.value as string}
            value={configField.value as string}
            onChange={(json) => { configField.onChange(json); }}
            onValidChange={onConfigValidChange}
          />

          <PronunciationHelper onInsert={handleInsertPronunciation} />
        </div>
      )}
    </div>
  );
}

