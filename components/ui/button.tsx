import type {ComponentProps} from 'react';
import {cva,type VariantProps} from 'class-variance-authority';
import {twMerge} from 'tailwind-merge';
const variants=cva('button',{variants:{variant:{default:'primary',outline:'secondary',ghost:'ghost'}},defaultVariants:{variant:'default'}});
export function Button({variant,className,...props}:ComponentProps<'button'>&VariantProps<typeof variants>){
  return <button className={twMerge(variants({variant}),className)} {...props}/>;
}
