import { toast } from 'sonner'

export const notify = {
  ok:      (msg: string) => toast.success(msg),
  err:     (msg: string) => toast.error(msg),
  info:    (msg: string) => toast.info(msg),
  loading: (msg: string) => toast.loading(msg),
  dismiss: (id: string | number) => toast.dismiss(id),
}
