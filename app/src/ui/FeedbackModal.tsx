import { ChangeEvent, useRef, useState } from 'react';
import Modal from '../ui/Modal';
import { submitFeedback } from '../state/api';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [type, setType] = useState<'problem' | 'suggestion'>('problem');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [attachment, setAttachment] = useState<File[]>([]);
  const [attachmentPreview, setAttachmentPreview] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim()) return;

    setLoading(true);
    console.log('📝 Sending feedback to server:', {
      type,
      description,
      contact,
      attachmentNames: attachment.map(f => f.name),
    });

    try {
      // Отправляем обратную связь на сервер
      const title = type === 'problem' 
        ? `Проблема: ${description.slice(0, 50)}...`
        : `Предложение: ${description.slice(0, 50)}...`;
      
      await submitFeedback({
        type,
        title,
        description: description.trim(),
        contact: contact.trim() || null,
      });
      
      console.log('✅ Feedback sent successfully to server');
      
      setSubmitted(true);
      
      // Автоматически закрываем через 2 секунды
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      console.error('❌ Error sending feedback:', error);
      alert('Ошибка при отправке обратной связи. Попробуйте еще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        alert('Можно прикреплять только изображения (PNG, JPG, WEBP).');
        event.target.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5 МБ.');
        event.target.value = '';
        return;
      }

      newFiles.push(file);

      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setAttachmentPreview(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }

    setAttachment(prev => [...prev, ...newFiles]);
  };

  const removeAttachment = (index: number) => {
    setAttachment(prev => prev.filter((_, i) => i !== index));
    setAttachmentPreview(prev => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setDescription('');
    setContact('');
    setAttachment([]);
    setAttachmentPreview([]);
    setSubmitted(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Modal onClose={onClose} title="Обратная связь">
      {submitted ? (
          <div className="text-center py-8">
            <div className="text-green-600 text-lg font-medium mb-2">
              ✓ Спасибо за обратную связь!
            </div>
            <p className="text-slate-300">Ваше сообщение сохранено локально.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Тип обращения
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="problem"
                    checked={type === 'problem'}
                    onChange={(e) => setType(e.target.value as 'problem')}
                    className="mr-2"
                  />
                  <span className="text-slate-300">Проблема</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="suggestion"
                    checked={type === 'suggestion'}
                    onChange={(e) => setType(e.target.value as 'suggestion')}
                    className="mr-2"
                  />
                  <span className="text-slate-300">Предложение</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Описание <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Опишите проблему или предложение..."
                className="w-full h-32 p-3 border border-slate-700 bg-slate-800 rounded-md resize-none text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Контакты (необязательно)
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email или другие контакты для связи"
                className="w-full p-3 border border-slate-700 bg-slate-800 rounded-md text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Прикрепить изображения (необязательно)
              </label>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*"
                onChange={handleAttachmentChange}
                className="w-full p-2 border border-slate-700 bg-slate-800 rounded-md text-sm text-slate-300"
              />
              <p className="text-xs text-slate-400 mt-1">
                Можно прикрепить несколько изображений (до 5 МБ каждое)
              </p>
            </div>

            {attachmentPreview.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Прикрепленные изображения:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {attachmentPreview.map((preview, index) => (
                    <div key={index} className="relative">
                      <img
                        src={preview}
                        alt={`Attachment ${index + 1}`}
                        className="w-full h-20 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={loading || !description.trim()}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Сохранение...' : 'Отправить'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
    </Modal>
  );
}