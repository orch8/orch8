"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { PanelLeftCloseIcon, PanelLeftIcon } from "lucide-react";
import * as React from "react";

import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { cn } from "../../lib/utils.js";
import { useUiStore } from "../../stores/ui.js";
import { Button } from "./Button.js";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "./Sheet.js";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./Tooltip.js";

type SidebarContextValue = {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  children,
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  const { isNarrow } = useBreakpoint();
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const activeDrawer = useUiStore((s) => s.activeDrawer);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const openMobile = activeDrawer === "sidebar";

  const setOpenMobile = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) openDrawer("sidebar");
      else closeDrawer();
    },
    [closeDrawer, openDrawer],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isNarrow) {
      setOpenMobile(!openMobile);
    } else {
      setOpen(!open);
    }
  }, [isNarrow, open, openMobile, setOpen, setOpenMobile]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      isMobile: isNarrow,
      open,
      openMobile,
      setOpen,
      setOpenMobile,
      state: open ? "expanded" : "collapsed",
      toggleSidebar,
    }),
    [isNarrow, open, openMobile, setOpen, setOpenMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={cn("group/sidebar-wrapper flex h-screen min-h-0 w-full bg-background", className)}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": "var(--size-sidebar-width)",
            "--sidebar-width-icon": "var(--size-sidebar-width-collapsed)",
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  className,
  children,
  side = "left",
  collapsible = "icon",
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  collapsible?: "icon" | "offcanvas" | "none";
}) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetPopup
          className={cn("w-[min(22rem,calc(100vw-1rem))] max-w-none border-edge-soft bg-sidebar p-0", className)}
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          showCloseButton={false}
          side={side}
          {...props}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Primary dashboard navigation.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full min-h-0 w-full flex-col">{children}</div>
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <div
      className={cn(
        "group peer hidden h-full shrink-0 border-edge-soft bg-sidebar text-foreground transition-[width] md:flex",
        side === "left" ? "border-r" : "border-l",
        collapsible === "none"
          ? "w-(--sidebar-width)"
          : state === "collapsed"
            ? collapsible === "offcanvas"
              ? "w-0 overflow-hidden border-0"
              : "w-(--sidebar-width-icon)"
            : "w-(--sidebar-width)",
        className,
      )}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-sidebar="sidebar"
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      {...props}
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden" data-slot="sidebar-inner">
        {children}
      </div>
    </div>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn("flex min-w-0 flex-1 flex-col overflow-hidden bg-background", className)}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { open, openMobile, toggleSidebar, isMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  return (
    <Button
      aria-label="Toggle sidebar"
      className={cn("size-8", className)}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...props}
    >
      {isOpen ? <PanelLeftCloseIcon /> : <PanelLeftIcon />}
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, onClick, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      aria-label="Toggle sidebar"
      className={cn("hidden w-2 cursor-ew-resize bg-transparent hover:bg-border/40 md:block", className)}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      tabIndex={-1}
      type="button"
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1 p-2", className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex min-w-0 flex-col gap-1", className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("group/menu-item min-w-0", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

function SidebarMenuButton({
  isActive = false,
  tooltip,
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & {
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipPopup>;
}) {
  const { isMobile, state } = useSidebar();
  const defaultProps = {
    className: cn(
      "focus-ring flex h-[var(--size-nav-row-height)] w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:shadow-[inset_2px_0_0_var(--primary)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&>svg]:shrink-0 [&>svg:not([class*='size-'])]:size-4 [&>span]:truncate group-data-[collapsible=icon]:[&>span]:sr-only",
      className,
    ),
    "data-active": isActive,
    "data-sidebar": "menu-button",
    "data-slot": "sidebar-menu-button",
  };
  const buttonElement = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });

  if (!tooltip) return buttonElement;
  const tooltipProps = typeof tooltip === "string" ? { children: tooltip } : tooltip;

  return (
    <Tooltip>
      <TooltipTrigger render={buttonElement as React.ReactElement<Record<string, unknown>>} />
      <TooltipPopup hidden={state !== "collapsed" || isMobile} side="right" {...tooltipProps} />
    </Tooltip>
  );
}

export {
  Sidebar,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
};
