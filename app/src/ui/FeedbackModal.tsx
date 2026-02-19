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
      // Sending feedback to the server
      const title = type === 'problem' 
        ? `Problem: ${description.slice(0, 50)}...`
        : `Suggestion: ${description.slice(0, 50)}...`;
      
      await submitFeedback({
        type,
        title,
        description: description.trim(),
        contact: contact.trim() || null,
      });
      
      console.log('✅ Feedback sent successfully to server');
      
      setSubmitted(true);
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      console.error('❌ Error sending feedback:', error);
      alert('Error sending feedback. Please try again.');
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
        alert('Only images can be attached (PNG, JPG, WEBP).');
        event.target.value = '';
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('File size must not exceed 5 MB.');
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
    <Modal onClose={onClose} title="Feedback">
      {submitted ? (
          <div className="text-center py-8">
            <div className="text-green-600 text-lg font-medium mb-2">
              ✓ Thank you for your feedback!
            </div>
            <p className="text-slate-300">Your message has been saved locally.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Request type
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
                  <span className="text-slate-300">Problem</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="suggestion"
                    checked={type === 'suggestion'}
                    onChange={(e) => setType(e.target.value as 'suggestion')}
                    className="mr-2"
                  />
                  <span className="text-slate-300">Suggestion</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue or suggestion..."
                className="w-full h-32 p-3 border border-slate-700 bg-slate-800 rounded-md resize-none text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Contact info (optional)
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or other contact info"
                className="w-full p-3 border border-slate-700 bg-slate-800 rounded-md text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Attach images (optional)
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
                You can attach multiple images (up to 5 MB each)
              </p>
            </div>

            {attachmentPreview.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  Attached images:
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
                {loading ? 'Saving...' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
    </Modal>
  );
}