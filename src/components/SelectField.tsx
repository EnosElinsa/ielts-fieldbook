import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

const EMPTY = '__fieldbook_empty__';
type Choice = {value:string; label:ReactNode; disabled?:boolean};
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  options?: Choice[]; triggerRole?: 'button' | 'combobox'; onValueChange?: (value:string)=>void;
};
function choicesFrom(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap(child=> {
    if(!isValidElement<{value?:string|number; disabled?:boolean; children?:ReactNode}>(child))return [];
    if(child.type==='option')return [{value:String(child.props.value??child.props.children??''),label:child.props.children,disabled:child.props.disabled}];
    return choicesFrom(child.props.children);
  });
}
/** One themed, viewport-positioned select for fields and toolbar filters. */
export function SelectField({options,children,value,defaultValue,onChange,onValueChange,disabled,id,name,className,triggerRole='combobox',...props}:Props) {
  const choices=options||choicesFrom(children);
  const selected=value==null ? undefined : String(value)||EMPTY;
  const label=props['aria-label'];
  return <Select.Root value={selected} defaultValue={defaultValue==null?undefined:String(defaultValue)||EMPTY} disabled={disabled} name={name}
    onValueChange={next=>{
      const value=next===EMPTY?'':next;
      onValueChange?.(value);
      if(onChange)onChange({target:{value,name},currentTarget:{value,name}} as React.ChangeEvent<HTMLSelectElement>);
    }}>
    <Select.Trigger {...props as React.ButtonHTMLAttributes<HTMLButtonElement>} type="button" role={triggerRole} id={id} disabled={disabled} className={`filter-trigger select-field ${className||''}`} aria-label={label}>
      <Select.Value placeholder="Choose an option"/><Select.Icon asChild><ChevronDown size={16} aria-hidden="true"/></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className="select-pop" position="popper" side="bottom" align="start" sideOffset={6} collisionPadding={12} sticky="always" aria-label={label}>
      <Select.ScrollUpButton className="select-scroll"><ChevronUp size={14}/></Select.ScrollUpButton>
      <Select.Viewport className="select-viewport">{choices.map(choice=><Select.Item key={choice.value} value={choice.value||EMPTY} disabled={choice.disabled} className="select-option">
        <Select.ItemText>{choice.label}</Select.ItemText><Select.ItemIndicator className="select-indicator"><Check size={15}/></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="select-scroll"><ChevronDown size={14}/></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
