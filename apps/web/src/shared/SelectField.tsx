import { useId, useState, type Ref } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Badge, type Tone } from "./components.tsx";
import s from "./ui.module.css";

type Option = {
  value: string;
  label: string;
  reference?: string;
  status?: { label: string; tone: Tone };
};

// Radix는 빈 문자열을 자리표시자로 쓴다. 실제 항목 값에는 접두사를 붙인다.
const optionKey = (value: string) => `option:${value}`;
const clearKey = "clear";

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  className = s.field,
  hideLabel,
  clearable,
  disabled,
  blocked,
  ref,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  hideLabel?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  blocked?: boolean;
  ref?: Ref<HTMLButtonElement>;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className={`${s.selectField} ${className}`}>
      <label htmlFor={id} className={hideLabel ? s.srOnly : undefined}>
        {label}
      </label>
      <Select.Root
        value={selected ? optionKey(selected.value) : ""}
        disabled={disabled || options.length === 0}
        open={open && !blocked && !disabled && options.length > 0}
        onOpenChange={(next) => setOpen(next && !blocked)}
        onValueChange={(next) => {
          if (!blocked)
            onChange(next === clearKey ? "" : next.slice("option:".length));
        }}
      >
        <Select.Trigger
          id={id}
          ref={ref}
          className={s.selectTrigger}
          aria-disabled={blocked || undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        >
          <span className={s.selectValue}>
            <Select.Value placeholder={placeholder}>
              {selected?.label}
            </Select.Value>
          </span>
          <Select.Icon asChild>
            <ChevronDown size={18} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            aria-label={label}
            className={s.selectContent}
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={16}
          >
            <Select.ScrollUpButton className={s.selectScroll}>
              <ChevronUp size={16} aria-hidden="true" />
            </Select.ScrollUpButton>
            <Select.Viewport className={s.selectViewport}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  className={s.selectOption}
                  value={optionKey(option.value)}
                  textValue={option.label}
                >
                  <Select.ItemText>
                    <span
                      className={
                        option.reference ? s.selectRecordName : undefined
                      }
                    >
                      {option.label}
                    </span>
                    {option.reference && (
                      <span className={s.selectRecordMeta}>
                        <code>{option.reference}</code>
                        {option.status && (
                          <Badge tone={option.status.tone}>
                            {option.status.label}
                          </Badge>
                        )}
                      </span>
                    )}
                  </Select.ItemText>
                  <Select.ItemIndicator className={s.selectCheck}>
                    <Check size={16} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
              {clearable && selected && (
                <Select.Item className={s.selectOption} value={clearKey}>
                  <Select.ItemText>선택 지우기</Select.ItemText>
                </Select.Item>
              )}
            </Select.Viewport>
            <Select.ScrollDownButton className={s.selectScroll}>
              <ChevronDown size={16} aria-hidden="true" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
