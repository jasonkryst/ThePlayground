import './CategorySection.css'

export default function CategorySection({ heading, children }) {
  return (
    <section className="category-section">
      <h2 className="category-section__heading">{heading}</h2>
      <div className="category-section__grid">
        {children}
      </div>
    </section>
  )
}
