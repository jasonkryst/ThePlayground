const IMAGE_ICON_RE = /\.(png|gif|jpe?g)$/i

export default function ManifestIcon({ icon, as: Tag = 'span', className, ariaHidden = false }) {
  if (IMAGE_ICON_RE.test(icon)) {
    return <img src={icon} alt="" className={className} />
  }
  return <Tag className={className} aria-hidden={ariaHidden || undefined}>{icon}</Tag>
}
