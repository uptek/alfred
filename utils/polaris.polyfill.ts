/**
 * Sets the selected value for an s-choice-list component
 * @param choiceListName - The name attribute of the s-choice-list
 * @param value - The value to select
 */
export function setChoiceListValue(choiceListName: string, value: string): void {
  const escapedName = CSS.escape(choiceListName);
  const choices = document.querySelectorAll<HTMLElement>(`[name="${escapedName}"] s-choice`);

  choices.forEach((choice) => {
    if (choice.getAttribute('value') === value) {
      choice.setAttribute('selected', '');
    } else {
      choice.removeAttribute('selected');
    }
  });
}

/**
 * Adds a change listener to an s-choice-list component
 * @param choiceListName - The name attribute of the s-choice-list
 * @param onChange - Callback function that receives the new value
 */
export function onChoiceListChange(
  choiceListName: string,
  onChange: (value: string) => void | Promise<void>
): (() => void) | undefined {
  const escapedName = CSS.escape(choiceListName);
  const choiceList = document.querySelector<HTMLElement>(`[name="${escapedName}"]`);

  if (!choiceList) {
    return;
  }

  const handler = async () => {
    const shadowRoot = choiceList.shadowRoot;
    if (!shadowRoot) return;

    const checkedInput = shadowRoot.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    if (!checkedInput) return;

    const value = checkedInput.getAttribute('value');
    if (value !== null) {
      await onChange(value);
    }
  };

  choiceList.addEventListener('change', () => void handler());

  // Return cleanup function
  return () => {
    choiceList.removeEventListener('change', () => void handler());
  };
}

/**
 * Sets the checked state for an s-checkbox component
 * @param checkboxName - The name attribute of the s-checkbox
 * @param checked - Whether the checkbox should be checked
 */
export function setCheckboxValue(checkboxName: string, checked: boolean): void {
  const escapedName = CSS.escape(checkboxName);
  const checkbox = document.querySelector<HTMLElement>(`s-checkbox[name="${escapedName}"]`);

  if (!checkbox) {
    return;
  }

  if (checked) {
    checkbox.setAttribute('checked', '');
  } else {
    checkbox.removeAttribute('checked');
  }
}

/**
 * Adds a change listener to an s-checkbox component
 * @param checkboxName - The name attribute of the s-checkbox
 * @param onChange - Callback function that receives the checked state
 * @returns Cleanup function to remove the listener
 */
export function onCheckboxChange(
  checkboxName: string,
  onChange: (checked: boolean) => void | Promise<void>
): (() => void) | undefined {
  const escapedName = CSS.escape(checkboxName);
  const checkbox = document.querySelector<HTMLElement>(`s-checkbox[name="${escapedName}"]`);

  if (!checkbox) {
    return;
  }

  const handler = async () => {
    const shadowRoot = checkbox.shadowRoot;
    if (!shadowRoot) return;

    const input = shadowRoot.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) return;

    await onChange(input.checked);
  };

  checkbox.addEventListener('change', () => void handler());

  // Return cleanup function
  return () => {
    checkbox.removeEventListener('change', () => void handler());
  };
}
