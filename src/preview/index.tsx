import React from 'react'
import { createRoot } from 'react-dom/client'
import PreviewApp from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>
)
