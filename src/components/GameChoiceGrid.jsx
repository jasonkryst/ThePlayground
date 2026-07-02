export default function GameChoiceGrid({
  choices, correctId, selected, locked, disabledChoiceIds, hintActive,
  onChoose, getChoiceProps, renderChoiceContent,
}) {
  return (
    <div className="game__choices">
      {choices.map((item, i) => {
        const isSelected = selected === item.id
        const isCorrect = item.id === correctId
        const isDisabledWrong = disabledChoiceIds.includes(item.id)

        let cls = 'game__choice'
        if (locked && isSelected && isCorrect) cls += ' correct'
        if (locked && isSelected && !isCorrect) cls += ' wrong'
        if ((locked || hintActive) && !isSelected && isCorrect) cls += ' highlight-correct'
        if (!locked && isDisabledWrong) cls += ' game__choice--disabled-wrong'

        const { className: extraClassName, ...restExtraProps } = getChoiceProps(item, i) ?? {}
        if (extraClassName) cls += ` ${extraClassName}`

        return (
          <button
            key={item.id}
            className={cls}
            disabled={locked || isDisabledWrong}
            onClick={() => onChoose(item)}
            {...restExtraProps}
          >
            {renderChoiceContent(item, i)}
          </button>
        )
      })}
    </div>
  )
}
