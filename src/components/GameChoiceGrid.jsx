import './GameChoiceGrid.css'

export default function GameChoiceGrid({
  choices, correctId, selected, locked, disabledChoiceIds, hintActive, hintStrength = 1,
  onChoose, getChoiceProps, renderChoiceContent,
}) {
  return (
    <div className="game__choices">
      {choices.map((item, i) => {
        const isSelected = selected === item.id
        const isCorrect = item.id === correctId
        const isDisabledWrong = disabledChoiceIds.includes(item.id)
        const isHintedCorrect = hintActive && !locked && !isSelected && isCorrect
        const isChoiceDisabled = locked || isDisabledWrong

        let cls = 'game__choice'
        if (locked && isSelected && isCorrect) cls += ' correct'
        if (locked && isSelected && !isCorrect) cls += ' wrong'
        if ((locked || hintActive) && !isSelected && isCorrect) cls += ' highlight-correct'
        if (!locked && isDisabledWrong) cls += ' game__choice--disabled-wrong'

        let glyph = null
        if (locked && isSelected && isCorrect) glyph = '✓'
        else if (locked && isSelected && !isCorrect) glyph = '✗'
        else if (locked && !isSelected && isCorrect) glyph = '✓'

        const { className: extraClassName, style: extraStyle, ...restExtraProps } = getChoiceProps(item, i) ?? {}
        if (extraClassName) cls += ` ${extraClassName}`

        const style = isHintedCorrect ? { ...extraStyle, '--hint-strength': hintStrength } : extraStyle

        return (
          <button
            key={item.id}
            className={cls}
            style={style}
            aria-disabled={isChoiceDisabled}
            onClick={() => { if (!isChoiceDisabled) onChoose(item) }}
            {...restExtraProps}
          >
            {renderChoiceContent(item, i)}
            {glyph && <span className="game__choice-glyph" aria-hidden="true">{glyph}</span>}
          </button>
        )
      })}
    </div>
  )
}
