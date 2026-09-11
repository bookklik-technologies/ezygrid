export type FormulaErrorValue =
  | '#NULL!'
  | '#DIV/0!'
  | '#VALUE!'
  | '#REF!'
  | '#NAME?'
  | '#NUM!'
  | '#N/A'
  | '#SPILL!'
  | '#CALC!'
  | '#CIRCULAR!';

export class FormulaError extends Error {
  readonly value: FormulaErrorValue;
  constructor(value: FormulaErrorValue, message?: string) {
    super(message ?? value);
    this.value = value;
  }
}

export const ERR = {
  NULL: () => new FormulaError('#NULL!'),
  DIV0: () => new FormulaError('#DIV/0!'),
  VALUE: () => new FormulaError('#VALUE!'),
  REF: () => new FormulaError('#REF!'),
  NAME: () => new FormulaError('#NAME?'),
  NUM: () => new FormulaError('#NUM!'),
  NA: () => new FormulaError('#N/A'),
  SPILL: () => new FormulaError('#SPILL!'),
  CALC: () => new FormulaError('#CALC!'),
  CIRCULAR: () => new FormulaError('#CIRCULAR!'),
};
