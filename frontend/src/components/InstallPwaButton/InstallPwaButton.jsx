import { useEffect, useState } from 'react'
import { canShowInstallPrompt, promptInstall, subscribeInstallPrompt } from '../../lib/pwaInstall.js'
import './InstallPwaButton.css'

export default function InstallPwaButton({ className = '' }) {
  const [visible, setVisible] = useState(canShowInstallPrompt)

  useEffect(() => subscribeInstallPrompt(setVisible), [])

  if (!visible) return null

  const onClick = async () => {
    await promptInstall()
  }

  return (
    <button
      type="button"
      className={['install-pwa-btn', className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      Install AllModelAI
    </button>
  )
}
