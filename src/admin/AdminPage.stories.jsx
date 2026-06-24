import { MemoryRouter } from 'react-router-dom'
import AdminPage from './AdminPage'

export default {
  title: 'Pages/AdminPage',
  component: AdminPage,
  decorators: [Story => <MemoryRouter><Story /></MemoryRouter>],
}

export const Default = {}
