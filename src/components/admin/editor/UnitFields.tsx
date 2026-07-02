"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFieldArray, useController } from "react-hook-form";
import type { Control, FieldErrors } from "react-hook-form";
import {
  DotsSixVerticalIcon,
  TrashIcon,
  PlusIcon,
  CaretDownIcon,
  CaretRightIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { newLesson } from "@/lib/admin/editor-model";
import { LessonFields } from "./LessonFields";
import type { EditorFormValues } from "@/lib/admin/editor-model";

const WORLD_OPTIONS = [
  { value: "sunshine", label: "Sunshine" },
  { value: "ocean", label: "Ocean" },
  { value: "space", label: "Space" },
  { value: "garden", label: "Garden" },
  { value: "bigtop", label: "Bigtop" },
];

const CHECKPOINT_OPTIONS = [
  { value: "", label: "None" },
  { value: "baseline", label: "Baseline" },
  { value: "mid", label: "Mid" },
  { value: "final", label: "Final" },
];

interface UnitFieldsProps {
  unitIndex: number;
  control: Control<EditorFormValues>;
  errors: FieldErrors<EditorFormValues>;
  onRemove: () => void;
  onConfigValidChange: (valid: boolean) => void;
}

export function UnitFields({
  unitIndex,
  control,
  errors,
  onRemove,
  onConfigValidChange,
}: UnitFieldsProps) {
  const prefix = `units.${unitIndex}` as const;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `unit-${unitIndex}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [open, setOpen] = useState(false);

  // Controlled fields — all called at top level of this component
  const { field: titleField } = useController({ control, name: `${prefix}.title` });
  const { field: unitKeyField } = useController({ control, name: `${prefix}.unitKey` });
  const { field: emojiField } = useController({ control, name: `${prefix}.emoji` });
  const { field: worldField } = useController({ control, name: `${prefix}.world` });
  const { field: bigIdeaField } = useController({ control, name: `${prefix}.bigIdea` });
  const { field: phonicsFocusField } = useController({ control, name: `${prefix}.phonicsFocus` });
  const { field: mathFocusField } = useController({ control, name: `${prefix}.mathFocus` });
  const { field: projectField } = useController({ control, name: `${prefix}.project` });
  const { field: checkpointField } = useController({ control, name: `${prefix}.checkpoint` });
  const { field: branchKeyField } = useController({ control, name: `${prefix}.branchKey` });

  const { fields: lessonFields, append, remove, move } = useFieldArray({
    control,
    name: `${prefix}.lessons`,
  });

  const sensors = useSensors(useSensor(PointerSensor));

  function handleLessonDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lessonFields.findIndex(
      (_, i) => `lesson-${unitIndex}-${i}` === active.id,
    );
    const newIndex = lessonFields.findIndex(
      (_, i) => `lesson-${unitIndex}-${i}` === over.id,
    );
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  }

  const unitErrors = errors.units?.[unitIndex];

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-line bg-paper">
      {/* Unit header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Drag to reorder unit"
          className="cursor-grab touch-none text-ink-faint active:cursor-grabbing"
        >
          <DotsSixVerticalIcon weight="regular" className="size-5" />
        </button>

        <button
          type="button"
          onClick={() => { setOpen((v) => !v); }}
          className="flex flex-1 items-center gap-2 text-left font-display text-base font-semibold text-ink"
        >
          {open ? (
            <CaretDownIcon weight="regular" className="size-4 text-ink-soft" />
          ) : (
            <CaretRightIcon weight="regular" className="size-4 text-ink-soft" />
          )}
          {emojiField.value as string && (
            <span aria-hidden="true">{emojiField.value as string}</span>
          )}
          <span className="truncate">
            {(titleField.value as string) || `Unit ${unitIndex + 1}`}
          </span>
          <span className="text-sm font-normal text-ink-soft">
            {lessonFields.length} {lessonFields.length === 1 ? "lesson" : "lessons"}
          </span>
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove unit"
          className="rounded p-1.5 text-ink-faint transition-colors hover:text-danger"
        >
          <TrashIcon weight="regular" className="size-4" />
        </button>
      </div>

      {/* Unit body */}
      {open && (
        <div className="flex flex-col gap-6 border-t border-line px-5 py-5">
          {/* Row 1: title + key + emoji */}
          <div className="grid grid-cols-3 gap-4">
            <Field
              id={`${prefix}-title`}
              label="Unit title"
              error={unitErrors?.title?.message}
              className="col-span-2"
            >
              {(fp) => (
                <TextInput
                  {...fp}
                  value={titleField.value as string}
                  onChange={titleField.onChange}
                  onBlur={titleField.onBlur}
                  invalid={!!unitErrors?.title}
                  placeholder="e.g. Under the Sea"
                />
              )}
            </Field>
            <Field id={`${prefix}-emoji`} label="Emoji" optional>
              {(fp) => (
                <TextInput
                  {...fp}
                  value={emojiField.value as string}
                  onChange={emojiField.onChange}
                  onBlur={emojiField.onBlur}
                  placeholder="🐠"
                  className="text-2xl"
                />
              )}
            </Field>
          </div>

          {/* Row 2: key + world + checkpoint */}
          <div className="grid grid-cols-3 gap-4">
            <Field id={`${prefix}-unitKey`} label="Unit key">
              {(fp) => (
                <TextInput
                  {...fp}
                  value={unitKeyField.value as string}
                  onChange={unitKeyField.onChange}
                  onBlur={unitKeyField.onBlur}
                  placeholder="unit-01"
                />
              )}
            </Field>
            <Field id={`${prefix}-world`} label="World">
              {(fp) => (
                <Select
                  {...fp}
                  value={worldField.value as string}
                  onChange={(e) => { worldField.onChange(e.target.value); }}
                  options={WORLD_OPTIONS}
                />
              )}
            </Field>
            <Field id={`${prefix}-checkpoint`} label="Checkpoint" optional>
              {(fp) => (
                <Select
                  {...fp}
                  value={checkpointField.value as string}
                  onChange={(e) => { checkpointField.onChange(e.target.value); }}
                  options={CHECKPOINT_OPTIONS}
                />
              )}
            </Field>
          </div>

          {/* Row 2.5: branch key (Adventure 2.0 forking, spec §4.4) */}
          <Field
            id={`${prefix}-branchKey`}
            label="Branch key"
            optional
            hint="Units sharing a branch key render as parallel map paths."
          >
            {(fp) => (
              <TextInput
                {...fp}
                value={branchKeyField.value as string}
                onChange={branchKeyField.onChange}
                onBlur={branchKeyField.onBlur}
                placeholder="left"
              />
            )}
          </Field>

          {/* Row 3: bigIdea */}
          <Field id={`${prefix}-bigIdea`} label="Big idea" optional>
            {(fp) => (
              <TextInput
                {...fp}
                value={bigIdeaField.value as string}
                onChange={bigIdeaField.onChange}
                onBlur={bigIdeaField.onBlur}
                placeholder="The guiding concept for this unit"
              />
            )}
          </Field>

          {/* Row 4: phonicsFocus + mathFocus */}
          <div className="grid grid-cols-2 gap-4">
            <Field id={`${prefix}-phonicsFocus`} label="Phonics focus" optional>
              {(fp) => (
                <TextInput
                  {...fp}
                  value={phonicsFocusField.value as string}
                  onChange={phonicsFocusField.onChange}
                  onBlur={phonicsFocusField.onBlur}
                  placeholder="sh, ch, th digraphs"
                />
              )}
            </Field>
            <Field id={`${prefix}-mathFocus`} label="Math focus" optional>
              {(fp) => (
                <TextInput
                  {...fp}
                  value={mathFocusField.value as string}
                  onChange={mathFocusField.onChange}
                  onBlur={mathFocusField.onBlur}
                  placeholder="Addition to 20"
                />
              )}
            </Field>
          </div>

          {/* Row 5: project */}
          <Field id={`${prefix}-project`} label="Project" optional>
            {(fp) => (
              <TextInput
                {...fp}
                value={projectField.value as string}
                onChange={projectField.onChange}
                onBlur={projectField.onBlur}
                placeholder="e.g. Build a sea creature diorama"
              />
            )}
          </Field>

          {/* Lessons */}
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-ink">
              Lessons ({lessonFields.length})
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleLessonDragEnd}
            >
              <SortableContext
                items={lessonFields.map((_, i) => `lesson-${unitIndex}-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                {lessonFields.map((field, li) => (
                  <LessonFields
                    key={field.id}
                    unitIndex={unitIndex}
                    lessonIndex={li}
                    control={control}
                    errors={errors}
                    onRemove={() => { remove(li); }}
                    onConfigValidChange={onConfigValidChange}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => { append(newLesson()); }}
              className="self-start"
            >
              <PlusIcon weight="bold" className="size-4" />
              Add lesson
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
