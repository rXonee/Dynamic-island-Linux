import React from 'react'
import DynamicIsland from '../components/DynamicIsland'

export default function Home() {
  return (
    <main
      className="w-full flex justify-center items-start pt-1 select-none"
      style={{
        width: '100%',
        minWidth: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}
    >
      <DynamicIsland />
    </main>
  )
}