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
export function onChoiceListChange(choiceListName: string, onChange: (value: string) => void | Promise<void>): void {
  const escapedName = CSS.escape(choiceListName);
  const choiceList = document.querySelector<HTMLElement>(`[name="${escapedName}"]`);

  if (!choiceList) {
    return;
  }

  choiceList.addEventListener('change', async () => {
    const shadowRoot = choiceList.shadowRoot;
    if (!shadowRoot) return;

    const checkedInput = shadowRoot.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    if (!checkedInput) return;

    const value = checkedInput.getAttribute('value');
    if (value !== null) {
      await onChange(value);
    }
  });
}
