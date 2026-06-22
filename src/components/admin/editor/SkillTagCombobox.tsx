"use client";

import { useState, useCallback } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { XIcon, TagIcon } from "@phosphor-icons/react/dist/ssr";
import { SKILLS } from "@/content/skills";
import { cn } from "@/lib/cn";

interface SkillTagComboboxProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Radix Popover + cmdk multi-select combobox sourced from SKILLS. */
export function SkillTagCombobox({ value, onChange }: SkillTagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = useCallback(
    (slug: string) => {
      if (value.includes(slug)) {
        onChange(value.filter((s) => s !== slug));
      } else {
        onChange([...value, slug]);
      }
    },
    [value, onChange],
  );

  const remove = useCallback(
    (slug: string) => {
      onChange(value.filter((s) => s !== slug));
    },
    [value, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((slug) => {
            const skill = SKILLS.find((s) => s.slug === slug);
            return (
              <span
                key={slug}
                className="inline-flex items-center gap-1 rounded-pill border border-line bg-paper-raised px-2.5 py-1 text-xs font-medium text-ink"
              >
                <TagIcon weight="regular" className="size-3 text-ink-soft" />
                {skill?.label ?? slug}
                <button
                  type="button"
                  aria-label={`Remove ${skill?.label ?? slug}`}
                  onClick={() => { remove(slug); }}
                  className="ml-0.5 rounded-full text-ink-faint transition-colors hover:text-danger"
                >
                  <XIcon weight="bold" className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-md border bg-paper-raised",
              "px-3.5 py-1.5 text-sm text-ink-faint transition-colors",
              "hover:border-line-strong hover:text-ink",
              "focus:border-accent focus:outline-none focus-visible:outline-none",
              open ? "border-accent text-ink" : "border-line",
            )}
          >
            <TagIcon weight="regular" className="size-4" />
            Add skill tags…
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            className="z-50 w-80 rounded-xl border border-line bg-paper-raised shadow-lg"
            align="start"
            sideOffset={4}
          >
            <Command>
              <div className="border-b border-line px-3 py-2">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search skills…"
                  className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                />
              </div>
              <Command.List className="max-h-72 overflow-y-auto py-1">
                <Command.Empty className="px-3 py-4 text-center text-sm text-ink-faint">
                  No skills found
                </Command.Empty>
                {/* Group by domain */}
                {[...new Set(SKILLS.map((s) => s.domain))].map((domain) => (
                  <Command.Group
                    key={domain}
                    heading={domain}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                  >
                    {SKILLS.filter((s) => s.domain === domain).map((skill) => {
                      const selected = value.includes(skill.slug);
                      return (
                        <Command.Item
                          key={skill.slug}
                          value={`${skill.domain} ${skill.label} ${skill.slug}`}
                          onSelect={() => { toggle(skill.slug); }}
                          className={cn(
                            "mx-1 flex cursor-pointer items-center justify-between gap-2",
                            "rounded-lg px-2.5 py-2 text-sm transition-colors",
                            "data-[selected=true]:bg-accent/10",
                            selected ? "text-ink" : "text-ink-soft",
                          )}
                        >
                          <span className="flex-1 truncate">{skill.label}</span>
                          {selected && (
                            <span className="text-xs font-semibold text-accent">selected</span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
