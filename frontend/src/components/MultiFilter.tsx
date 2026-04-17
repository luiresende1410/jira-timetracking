import Multiselect from "@cloudscape-design/components/multiselect";
import type { MultiselectProps } from "@cloudscape-design/components/multiselect";

interface Props {
  label: string;
  options: string[];
  excluded: Set<string>;
  onChange: (excluded: Set<string>) => void;
}

export default function MultiFilter({ label, options, excluded, onChange }: Props) {
  const allOptions: MultiselectProps.Option[] = options.map(o => ({ label: o, value: o }));

  const selectedOptions: MultiselectProps.Option[] = options
    .filter(o => !excluded.has(o))
    .map(o => ({ label: o, value: o }));

  return (
    <div style={{ display: "inline-block", minWidth: 300 }}>
      <Multiselect
        selectedOptions={selectedOptions}
        onChange={({ detail }) => {
          const selectedSet = new Set(
            detail.selectedOptions
              .map(i => i.value)
              .filter((v): v is string => v !== undefined)
          );
          onChange(new Set(options.filter(o => !selectedSet.has(o))));
        }}
        options={allOptions}
        placeholder={label}
        filteringType="auto"
        tokenLimit={2}
        hideTokens={false}
      />
    </div>
  );
}
