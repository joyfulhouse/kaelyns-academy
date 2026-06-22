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
import { Button } from "@/components/ui/Button";
import { newActivity } from "@/lib/admin/editor-model";
import { ActivityFields } from "./ActivityFields";
import type { EditorFormValues } from "@/lib/admin/editor-model";

interface LessonFieldsProps {
  unitIndex: number;
  lessonIndex: number;
  control: Control<EditorFormValues>;
  errors: FieldErrors<EditorFormValues>;
  onRemove: () => void;
  onConfigValidChange: (valid: boolean) => void;
}

export function LessonFields({
  unitIndex,
  lessonIndex,
  control,
  errors,
  onRemove,
  onConfigValidChange,
}: LessonFieldsProps) {
  const prefix = `units.${unitIndex}.lessons.${lessonIndex}` as const;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lesson-${unitIndex}-${lessonIndex}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [open, setOpen] = useState(false);

  // Controlled text fields at this level (hook calls at top of component — valid)
  const { field: titleField } = useController({ control, name: `${prefix}.title` });
  const { field: lessonKeyField } = useController({ control, name: `${prefix}.lessonKey` });

  const { fields: activityFields, append, remove, move } = useFieldArray({
    control,
    name: `${prefix}.activities`,
  });

  const sensors = useSensors(useSensor(PointerSensor));

  function handleActivityDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activityFields.findIndex(
      (_, i) => `act-${unitIndex}-${lessonIndex}-${i}` === active.id,
    );
    const newIndex = activityFields.findIndex(
      (_, i) => `act-${unitIndex}-${lessonIndex}-${i}` === over.id,
    );
    if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex);
  }

  const lessonErrors = errors.units?.[unitIndex]?.lessons?.[lessonIndex];

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-line bg-paper-sunk">
      {/* Lesson header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Drag to reorder lesson"
          className="cursor-grab touch-none text-ink-faint active:cursor-grabbing"
        >
          <DotsSixVerticalIcon weight="regular" className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => { setOpen((v) => !v); }}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-ink"
        >
          {open ? (
            <CaretDownIcon weight="regular" className="size-3.5 text-ink-soft" />
          ) : (
            <CaretRightIcon weight="regular" className="size-3.5 text-ink-soft" />
          )}
          Lesson {lessonIndex + 1}
          <span className="text-xs font-normal text-ink-soft">
            {activityFields.length} {activityFields.length === 1 ? "activity" : "activities"}
          </span>
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove lesson"
          className="rounded p-1 text-ink-faint transition-colors hover:text-danger"
        >
          <TrashIcon weight="regular" className="size-4" />
        </button>
      </div>

      {/* Lesson body */}
      {open && (
        <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              id={`${prefix}-title`}
              label="Lesson title"
              error={lessonErrors?.title?.message}
            >
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  value={titleField.value as string}
                  onChange={titleField.onChange}
                  onBlur={titleField.onBlur}
                  invalid={!!lessonErrors?.title}
                  placeholder="e.g. Monday"
                />
              )}
            </Field>
            <Field id={`${prefix}-lessonKey`} label="Lesson key">
              {(fieldProps) => (
                <TextInput
                  {...fieldProps}
                  value={lessonKeyField.value as string}
                  onChange={lessonKeyField.onChange}
                  onBlur={lessonKeyField.onBlur}
                  placeholder="lesson-01"
                />
              )}
            </Field>
          </div>

          {/* Activities */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-ink-soft">
              Activities ({activityFields.length})
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleActivityDragEnd}
            >
              <SortableContext
                items={activityFields.map((_, i) => `act-${unitIndex}-${lessonIndex}-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                {activityFields.map((field, ai) => (
                  <ActivityFields
                    key={field.id}
                    unitIndex={unitIndex}
                    lessonIndex={lessonIndex}
                    activityIndex={ai}
                    control={control}
                    errors={errors}
                    onRemove={() => { remove(ai); }}
                    onConfigValidChange={onConfigValidChange}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={() => { append(newActivity()); }}
            className="self-start"
          >
            <PlusIcon weight="bold" className="size-4" />
            Add activity
          </Button>
        </div>
      )}
    </div>
  );
}
