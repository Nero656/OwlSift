import type { ChatMessage, LocalFile } from '../types/file'

export const useAi = () => {
    const messages = useState<ChatMessage[]>(
        'ai-messages',
        () => []
    )

    const isThinking = ref(false)

    const ask = async (
        file: LocalFile,
        question: string
    ) => {
        if (!question.trim()) return

        messages.value.push({
            sender: 'user',
            text: question
        })

        isThinking.value = true

        try {
            /*
             * На первом этапе:
             * await $fetch('/api/ai/chat', {
             *   method: 'POST',
             *   body: {
             *     fileId: file.id,
             *     question
             *   }
             * })
             */

            await new Promise(resolve =>
                setTimeout(resolve, 800)
            )

            messages.value.push({
                sender: 'ai',
                text: `Analyzing "${file.name}"...\n\n${file.summary}`
            })
        } finally {
            isThinking.value = false
        }
    }

    const clear = () => {
        messages.value = []
    }

    return {
        messages,
        isThinking,
        ask,
        clear
    }
}