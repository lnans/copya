import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type OptionSelectProps<T extends string> = {
  id?: string
  value: T
  options: Record<T, string>
  onChange: (value: T) => void
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string
}

export function OptionSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  size,
  className,
  "aria-label": ariaLabel,
}: OptionSelectProps<T>) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next as T)
      }}
    >
      <SelectTrigger id={id} size={size} className={className} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(options) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {options[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
