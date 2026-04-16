import Multiselect from "@cloudscape-design/components/multiselect";

interface Props {
  label: string;
  options: string[];
  excluded: Set<string>;
  onChange: (excluded: Set<string>) => void;
}

export default function MultiFilter({ label, options, excluded, onChange }: Props) {
  // Cloudscape Multiselect works with "selected" items, but our API uses "excluded" items.
  // We need to invert: selected = options NOT in excluded
  const selectedOptions = options
    .filter(o => !excluded.has(o))
    .map(o => ({ label: o, value: o }));

  const allOptions = options.map(o => ({ label: o, value: o }));

  const handleChange = (selectedItems: ReadonlyArray<{ value?: string }>) => {
    const selectedSet = new Set(selectedItems.map(i => i.value).filter((v): v is string => v !== undefined));
    const newExcluded = new Set(options.filter(o => !selectedSet.has(o)));
    onChange(newExcluded);
  };

  return (
    <div style={{ display: 'inline-block', minWidth: 280 }}>
      <Multiselect
        selectedOptions={selectedOptions}
        onChange={({ detail }) => handleChange(detail.selectedOptions)}
        options={allOptions}
        placeholder={label}
        filteringType="auto"
        tokenLimit={2}
      />
    </div>
  );
}
