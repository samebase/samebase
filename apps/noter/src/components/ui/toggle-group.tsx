import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
  orientation: "horizontal",
});

type ToggleGroupSharedProps = Omit<
  ToggleGroupPrimitive.Props<string>,
  "defaultValue" | "multiple" | "onValueChange" | "value"
> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
    orientation?: "horizontal" | "vertical";
  };

type SingleToggleGroupProps = ToggleGroupSharedProps & {
  type?: "single";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string | undefined) => void;
};

type MultipleToggleGroupProps = ToggleGroupSharedProps & {
  type: "multiple";
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
};

type ToggleGroupProps = SingleToggleGroupProps | MultipleToggleGroupProps;

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupProps) {
  const commonProps = {
    "data-slot": "toggle-group",
    "data-variant": variant,
    "data-size": size,
    "data-spacing": spacing,
    "data-orientation": orientation,
    style: { "--gap": spacing } as React.CSSProperties,
    className: cn(
      "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=0]:data-[variant=outline]:shadow-xs data-vertical:flex-col data-vertical:items-stretch",
      className,
    ),
  } as const;

  if (props.type === "multiple") {
    const { defaultValue, onValueChange, value, type: _type, ...primitiveProps } = props;

    return (
      <ToggleGroupPrimitive<string>
        {...commonProps}
        {...primitiveProps}
        defaultValue={defaultValue === undefined ? undefined : [...defaultValue]}
        multiple
        onValueChange={(groupValue) => {
          onValueChange?.(groupValue);
        }}
        value={value === undefined ? undefined : [...value]}
      >
        <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
          {children}
        </ToggleGroupContext.Provider>
      </ToggleGroupPrimitive>
    );
  }

  const { defaultValue, onValueChange, value, type: _type, ...primitiveProps } = props;

  return (
    <ToggleGroupPrimitive<string>
      {...commonProps}
      {...primitiveProps}
      defaultValue={defaultValue === undefined ? undefined : [defaultValue]}
      onValueChange={(groupValue) => {
        onValueChange?.(groupValue[0]);
      }}
      value={value === undefined ? undefined : [value]}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 group-data-[spacing=0]/toggle-group:shadow-none focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-md group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-md group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-md group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-md data-[state=on]:bg-muted group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
