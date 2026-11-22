"use client";

import {
  AppstoreOutlined,
  BankOutlined,
  BellOutlined,
  CheckCircleFilled,
  EnvironmentOutlined,
  LogoutOutlined,
  MenuOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  Drawer,
  Empty,
  Form,
  Input,
  Layout,
  Menu,
  message,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  theme,
} from "antd";
import type { TableProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./dashboard.css";

const styles = {
  adminAvatar: "adminAvatar",
  adminInfo: "adminInfo",
  brand: "brand",
  brandCaption: "brandCaption",
  brandMark: "brandMark",
  brandName: "brandName",
  content: "dashboardContent",
  createButton: "createButton",
  desktopTable: "desktopTable",
  drawerFooter: "drawerFooter",
  drawerIcon: "drawerIcon",
  drawerTitle: "drawerTitle",
  eyebrow: "eyebrow",
  formSection: "formSection",
  header: "dashboardHeader",
  headerIconButton: "headerIconButton",
  headerTitle: "headerTitle",
  listCard: "listCard",
  listHeader: "listHeader",
  logoutButton: "logoutButton",
  mainLayout: "mainLayout",
  menu: "dashboardMenu",
  menuLabel: "menuLabel",
  mobileCard: "mobileCard",
  mobileCardHeader: "mobileCardHeader",
  mobileDetails: "mobileDetails",
  mobileList: "mobileList",
  mobileMenuButton: "mobileMenuButton",
  mobileNavigation: "mobileNavigation",
  search: "dashboardSearch",
  shell: "dashboard-shell",
  sidebarFooter: "sidebarFooter",
  sider: "dashboardSider",
  statCard: "statCard",
  statIconBlue: "statIconBlue",
  statIconGreen: "statIconGreen",
  statIconOrange: "statIconOrange",
  stats: "dashboardStats",
  tableAvatar: "tableAvatar",
  tableMeta: "tableMeta",
  tableTitle: "tableTitle",
  tableWrap: "tableWrap",
  titleRow: "titleRow",
} as const;

const { Header, Content, Sider } = Layout;

type LubricentroForm = {
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  responsable: string;
  password: string;
  confirmPassword: string;
};

type Lubricentro = Omit<LubricentroForm, 'password' | 'confirmPassword'> & {
  id: string;
  estado: "Activo" | "Inactivo";
  fechaAlta: string;
};

const menuItems = [
  { key: "resumen", icon: <AppstoreOutlined />, label: "Resumen" },
  { key: "lubricentros", icon: <ShopOutlined />, label: "Lubricentros" },
  { key: "usuarios", icon: <TeamOutlined />, label: "Usuarios" },
  { key: "configuracion", icon: <SettingOutlined />, label: "Configuración" },
];

export default function Dashboard() {
  const router = useRouter();
  const [form] = Form.useForm<LubricentroForm>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [lubricentros, setLubricentros] = useState<Lubricentro[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/lubricentros', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'No se pudo cargar el listado');
        if (active) setLubricentros(data);
      })
      .catch((error: Error) => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredLubricentros = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    if (!term) return lubricentros;

    return lubricentros.filter((item) =>
      [item.nombre, item.ciudad]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(term),
    );
  }, [lubricentros, search]);

  async function changeStatus(id: string, active: boolean) {
    const estado: Lubricentro['estado'] = active ? 'Activo' : 'Inactivo';
    try {
      setUpdatingId(id);
      const response = await fetch(`/api/admin/lubricentros/${id}/estado`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
      });
      const updated: Lubricentro & { message?: string } = await response.json();
      if (!response.ok) throw new Error(updated.message || 'No se pudo guardar el estado');
      setLubricentros((items) => items.map((item) => item.id === id ? updated : item));
      message.success(`Estado actualizado: ${estado.toLowerCase()}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'No se pudo guardar el cambio de estado');
    } finally { setUpdatingId(null); }
  }

  const columns: TableProps<Lubricentro>["columns"] = [
    {
      title: "Lubricentro",
      dataIndex: "nombre",
      key: "nombre",
      render: (nombre: string) => (
        <Space size={12}>
          <Avatar className={styles.tableAvatar} icon={<ShopOutlined />} />
          <div>
            <strong className={styles.tableTitle}>{nombre}</strong>
          </div>
        </Space>
      ),
    },
    {
      title: "Ubicación",
      key: "ubicacion",
      responsive: ["lg"],
      render: (_, record) => `${record.ciudad}, ${record.provincia}`,
    },
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      render: (_, record) => (
        <Switch
          checked={record.estado === 'Activo'}
          loading={updatingId === record.id}
          disabled={updatingId !== null}
          checkedChildren="Activo"
          unCheckedChildren="Inactivo"
          aria-label={`Estado de ${record.nombre}`}
          onChange={(active) => changeStatus(record.id, active)}
        />
      ),
    },
  ];

  const saveLubricentro = async (values: LubricentroForm) => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/lubricentros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.message || 'No se pudo registrar el lubricentro');
      setLubricentros((items) => [created, ...items]);
      setDrawerOpen(false);
      form.resetFields();
      message.success('Lubricentro registrado con su contraseña');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'No se pudo registrar el lubricentro');
    } finally { setSaving(false); }
  };

  const closeDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    form.resetFields();
  };

  const navigation = (
    <>
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <ShopOutlined />
        </div>
        <div>
          <span className={styles.brandName}>Tu Lubricentro</span>
          <span className={styles.brandCaption}>Panel raíz</span>
        </div>
      </div>
      <span className={styles.menuLabel}>GESTIÓN</span>
      <Menu
        className={styles.menu}
        theme="light"
        mode="inline"
        selectedKeys={["lubricentros"]}
        items={menuItems}
        onClick={() => setMobileMenuOpen(false)}
      />
      <div className={styles.sidebarFooter}>
        <Avatar size={38} className={styles.adminAvatar}>RA</Avatar>
        <div className={styles.adminInfo}>
          <strong>Administrador</strong>
          <span>Cuenta raíz</span>
        </div>
        <Button className={styles.logoutButton} type="text" aria-label="Cerrar sesión" icon={<LogoutOutlined />} onClick={async () => {
          const response = await fetch('/api/admin/logout', { method: 'POST' });
          if (response.ok) { router.replace('/login'); router.refresh(); }
          else message.error('No se pudo cerrar sesión');
        }} />
      </div>
    </>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#155fa0",
          colorInfo: "#155fa0",
          colorSuccess: "#2e9b62",
          borderRadius: 10,
          fontSize: 16,
          colorBgLayout: "#f3f6f5",
        },
        components: {
          Button: { controlHeight: 42, fontWeight: 600 },
          Input: { controlHeight: 42 },
          Table: { headerBg: "#f7f9f8", headerColor: "#52605a" },
        },
      }}
    >
      <Layout className={`${styles.shell} dashboard-root`}>
        <Sider width={260} className={styles.sider} theme="light">
          {navigation}
        </Sider>

        <Drawer
          placement="left"
          size={280}
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          styles={{ body: { padding: 0 } }}
          className={styles.mobileNavigation}
        >
          {navigation}
        </Drawer>

        <Layout className={styles.mainLayout}>
          <Header className={styles.header}>
            <Button
              className={styles.mobileMenuButton}
              type="text"
              icon={<MenuOutlined />}
              aria-label="Abrir menú"
              onClick={() => setMobileMenuOpen(true)}
            />
            <div className={styles.headerTitle}>
              <strong>Administración general</strong>
              <span>Gestioná todos tus lubricentros desde un solo lugar</span>
            </div>
            <Button className={styles.headerIconButton} type="text" shape="circle" aria-label="Notificaciones" icon={<BellOutlined />} />
          </Header>

          <Content className={styles.content}>
            {loadError && <Alert type="error" showIcon title={loadError} style={{ marginBottom: 20 }} />}
            <section className={styles.titleRow}>
              <div>
                <span className={styles.eyebrow}>ORGANIZACIONES</span>
                <h1>Lubricentros</h1>
                <p>Registrá y administrá los comercios que usan la plataforma.</p>
              </div>
              <Button className={styles.createButton} type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
                Nuevo lubricentro
              </Button>
            </section>

            <Row gutter={[16, 16]} className={styles.stats}>
              <Col xs={24} sm={12} xl={8}>
                <Card className={styles.statCard} variant="borderless">
                  <Statistic
                    title="Lubricentros registrados"
                    value={lubricentros.length}
                    prefix={<ShopOutlined className={styles.statIconGreen} />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Card className={styles.statCard} variant="borderless">
                  <Statistic
                    title="Comercios activos"
                    value={lubricentros.filter((item) => item.estado === 'Activo').length}
                    prefix={<CheckCircleFilled className={styles.statIconBlue} />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={8}>
                <Card className={styles.statCard} variant="borderless">
                  <Statistic
                    title="Localidades alcanzadas"
                    value={new Set(lubricentros.map((item) => item.ciudad)).size}
                    prefix={<EnvironmentOutlined className={styles.statIconOrange} />}
                  />
                </Card>
              </Col>
            </Row>

            <Card className={styles.listCard} variant="borderless" styles={{ body: { padding: 0 } }}>
              <div className={styles.listHeader}>
                <div>
                  <h2>Todos los lubricentros</h2>
                  <p>{lubricentros.length} registrados en total</p>
                </div>
                <Input
                  allowClear
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  prefix={<SearchOutlined />}
                  placeholder="Buscar por nombre o ciudad"
                  className={styles.search}
                />
              </div>
              <div className={`${styles.tableWrap} ${styles.desktopTable}`}>
                <Table<Lubricentro>
                  loading={loading}
                  rowKey="id"
                  columns={columns}
                  dataSource={filteredLubricentros}
                  pagination={{ pageSize: 6, hideOnSinglePage: true }}
                  locale={{
                    emptyText: (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <span>
                            {search
                              ? "No encontramos resultados para tu búsqueda."
                              : "Todavía no registraste ningún lubricentro."}
                          </span>
                        }
                      >
                        {!search && (
                          <Button type="primary" onClick={() => setDrawerOpen(true)}>
                            Registrar el primero
                          </Button>
                        )}
                      </Empty>
                    ),
                  }}
                />
              </div>

              <div className={styles.mobileList}>
                {filteredLubricentros.length ? (
                  filteredLubricentros.map((lubricentro) => (
                    <article className={styles.mobileCard} key={lubricentro.id}>
                      <div className={styles.mobileCardHeader}>
                        <Avatar className={styles.tableAvatar} icon={<ShopOutlined />} />
                        <div>
                          <strong>{lubricentro.nombre}</strong>
                        </div>
                        <Switch
                          checked={lubricentro.estado === 'Activo'}
                          loading={updatingId === lubricentro.id}
                          disabled={updatingId !== null}
                          checkedChildren="Activo"
                          unCheckedChildren="Inactivo"
                          aria-label={`Estado de ${lubricentro.nombre}`}
                          onChange={(active) => changeStatus(lubricentro.id, active)}
                        />
                      </div>
                      <dl className={styles.mobileDetails}>
                        <div>
                          <dt>Ubicación</dt>
                          <dd>{lubricentro.ciudad}, {lubricentro.provincia}</dd>
                        </div>
                      </dl>
                    </article>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={loading ? 'Cargando lubricentros...' : loadError ? 'Listado no disponible' : search ? "No encontramos resultados." : "Todavía no registraste ningún lubricentro."}
                  >
                    {!search && (
                      <Button type="primary" onClick={() => setDrawerOpen(true)}>
                        Registrar el primero
                      </Button>
                    )}
                  </Empty>
                )}
              </div>
            </Card>
          </Content>
        </Layout>
      </Layout>

      <Drawer
        title={
          <div className={styles.drawerTitle}>
            <span className={styles.drawerIcon}><BankOutlined /></span>
            <div>
              <strong>Registrar lubricentro</strong>
              <span>Completá los datos del nuevo comercio</span>
            </div>
          </div>
        }
        size={560}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        footer={
          <div className={styles.drawerFooter}>
            <Button onClick={closeDrawer}>Cancelar</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              Registrar lubricentro
            </Button>
          </div>
        }
      >
        <Form<LubricentroForm>
          form={form}
          layout="vertical"
          requiredMark="optional"
          onFinish={saveLubricentro}
          autoComplete="off"
        >
          <div className={styles.formSection}>
            <h3>Información comercial</h3>
            <p>Datos principales con los que se identificará al lubricentro.</p>
          </div>
          <Form.Item
            label="Nombre comercial"
            name="nombre"
            rules={[{ required: true, message: "Ingresá el nombre comercial" }]}
          >
            <Input placeholder="Ej. Lubricentro Central" />
          </Form.Item>

          <div className={styles.formSection}>
            <h3>Contacto y ubicación</h3>
            <p>Información para comunicarse y localizar el comercio.</p>
          </div>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Correo electrónico"
                name="email"
                rules={[
                  { required: true, message: "Ingresá un correo" },
                  { type: "email", message: "Ingresá un correo válido" },
                ]}
              >
                <Input placeholder="contacto@lubricentro.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Teléfono"
                name="telefono"
                rules={[{ required: true, message: "Ingresá un teléfono" }]}
              >
                <Input placeholder="11 4567-8900" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="Dirección"
            name="direccion"
            rules={[{ required: true, message: "Ingresá la dirección" }]}
          >
            <Input placeholder="Av. San Martín 1234" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Ciudad"
                name="ciudad"
                rules={[{ required: true, message: "Ingresá la ciudad" }]}
              >
                <Input placeholder="Ciudad" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                label="Provincia"
                name="provincia"
                rules={[{ required: true, message: "Ingresá la provincia" }]}
              >
                <Input placeholder="Provincia" />
              </Form.Item>
            </Col>
          </Row>

          <div className={styles.formSection}>
            <h3>Responsable</h3>
            <p>Persona encargada de administrar este comercio.</p>
          </div>
          <Form.Item
            label="Nombre y apellido"
            name="responsable"
            rules={[{ required: true, message: "Ingresá el nombre del responsable" }]}
          >
            <Input placeholder="Nombre del responsable" />
          </Form.Item>
          <div className={styles.formSection}>
            <h3>Acceso del lubricentro</h3>
            <p>Asigná una contraseña para el correo electrónico registrado.</p>
          </div>
          <Form.Item label="Contraseña" name="password" rules={[
            { required: true, message: 'Ingresá una contraseña' },
            { min: 6, max: 128, message: 'Usá entre 6 y 128 caracteres' },
          ]}>
            <Input.Password autoComplete="new-password" placeholder="Mínimo 6 caracteres" maxLength={128} />
          </Form.Item>
          <Form.Item label="Confirmar contraseña" name="confirmPassword" dependencies={['password']} rules={[
            { required: true, message: 'Confirmá la contraseña' },
            ({ getFieldValue }) => ({ validator(_, value) {
              return !value || value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Las contraseñas no coinciden'));
            } }),
          ]}>
            <Input.Password autoComplete="new-password" placeholder="Repetí la contraseña" maxLength={128} />
          </Form.Item>
        </Form>
      </Drawer>
    </ConfigProvider>
  );
}
