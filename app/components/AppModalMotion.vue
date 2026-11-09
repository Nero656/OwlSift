<template>
  <Transition
    appear
    name="owl-modal"
    @before-enter="element => element.removeAttribute('inert')"
    @before-leave="element => element.setAttribute('inert', '')"
  >
    <slot />
  </Transition>
</template>
