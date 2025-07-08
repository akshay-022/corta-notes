import { BubbleMenu } from '@tiptap/react'
import { Editor } from '@tiptap/core'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3 } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  editor: Editor
}

function Button({ onClick, active, icon: Icon, tooltip }: {
  onClick: () => void
  active: boolean
  icon: any
  tooltip: string
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={clsx(
        'p-1 rounded hover:bg-gray-600/30',
        active ? 'text-blue-400' : 'text-gray-300'
      )}
    >
      <Icon size={16} />
    </button>
  )
}

export const FormattingBubbleMenu = ({ editor }: Props) => {
  if (!editor) return null
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      shouldShow={({ editor }) => {
        const { from, to } = editor.state.selection
        return from !== to // show only when text range selected
      }}
      className="flex items-center gap-1 bg-[#2a2a2a] border border-gray-600 rounded-lg px-2 py-1 shadow-lg z-50"
    >
      <Button
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        icon={Bold}
        tooltip="Bold (⌘/Ctrl+B)"
      />
      <Button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        icon={Italic}
        tooltip="Italic (⌘/Ctrl+I)"
      />
      <Button
        onClick={() => (editor.chain() as any).focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        icon={UnderlineIcon}
        tooltip="Underline (⌘/Ctrl+U)"
      />
      <Button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        icon={Strikethrough}
        tooltip="Strikethrough (⌘/Ctrl+Shift+S)"
      />
      
      {/* Separator */}
      <div className="w-px h-4 bg-gray-600 mx-1" />
      
      {/* Heading buttons */}
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        icon={Heading1}
        tooltip="Heading 1 (⌘/Ctrl+Alt+1)"
      />
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        icon={Heading2}
        tooltip="Heading 2 (⌘/Ctrl+Alt+2)"
      />
      <Button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        icon={Heading3}
        tooltip="Heading 3 (⌘/Ctrl+Alt+3)"
      />
    </BubbleMenu>
  )
} 